/**
 * Wrapper around an HTML element that facilitates adjusting and managing it.
 */
export class Wrap<T extends HTMLElement | SVGElement> {

    static readonly idPrefix = 'comentario-';

    constructor(
        private el?: T,
    ) {}

    /**
     * Instantiate a new element with the given tag name, and return a new Wrap object for it.
     * @param tagName Name of the tag to create an element with.
     */
    static new<K extends keyof HTMLElementTagNameMap>(tagName: K): Wrap<HTMLElementTagNameMap[K]> {
        return new Wrap(document.createElement(tagName));
    }

    /**
     * Instantiate a new SVG element and return a new Wrap object for it.
     */
    static newSvg(): Wrap<SVGElement> {
        return new Wrap(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    }

    /**
     * Find an existing element with the given ID, prepending it with idPrefix. Whether the element actually exists, can
     * be derived from the ok property.
     * @param id ID of the element to find (excluding the prefix).
     */
    static byId<K extends keyof HTMLElementTagNameMap>(id: string): Wrap<HTMLElementTagNameMap[K]> {
        return new Wrap(document.getElementById(this.idPrefix + id) as HTMLElementTagNameMap[K]);
    }

    /**
     * The underlying HTML element. Throws an error if no element present.
     */
    get element(): T {
        if (!this.el) {
            throw new Error('No underlying HTML element in the Wrap');
        }
        return this.el;
    }

    /**
     * Whether the underlying element is present.
     */
    get ok(): boolean {
        return !!this.el;
    }

    /**
     * Whether the underlying element has children.
     */
    get hasChildren(): boolean {
        return !!this.el?.childNodes?.length;
    }

    /**
     * Value of the underlying element.
     */
    get val(): string {
        return (this.el as any)?.value;
    }

    /**
     * Whether the underlying (input) element is checked.
     */
    get isChecked(): boolean {
        return (this.el as unknown as HTMLInputElement)?.checked;
    }

    /**
     * Set attributes of the underlying element from the provided object.
     * @param values Object that provides attribute names and their values. null and undefined values cause attribute
     * removal from the node.
     */
    attr(values: Record<string, string | null | undefined> | false | null | undefined): Wrap<T> {
        if (this.el && values) {
            Object.entries(values).forEach(([k, v]) => {
                if (v === undefined || v === null) {
                    this.el!.removeAttribute(k);
                } else {
                    this.el!.setAttribute(k, v);
                }
            });
        }
        return this;
    }

    /**
     * Set the ID of the underlying element;
     * @param s New value to set.     */
    id(s: string): Wrap<T> {
        if (this.el) {
            this.el.id = Wrap.idPrefix + s;
        }
        return this;
    }

    /**
     * Set the innerText of the underlying element;
     * @param s New value to set.
     */
    inner(s: string): Wrap<T> {
        if (this.el instanceof HTMLElement) {
            this.el.innerText = s;
        }
        return this;
    }

    /**
     * Set the value of the underlying element;
     * @param s New value to set.
     */
    value(s: string): Wrap<T> {
        if (this.el) {
            (this.el as any).value = s;
        }
        return this;
    }

    /**
     * Set the innerHTML of the underlying element;
     * @param s New value to set.
     */
    html(s: string): Wrap<T> {
        if (this.el) {
            this.el.innerHTML = s;
        }
        return this;
    }

    /**
     * Set the style of the underlying element;
     * @param s New value to set.
     */
    style(s: string): Wrap<T> {
        return this.attr({style: s});
    }

    /**
     * Insert the specified elements as first children to the underlying element.
     * @param children Wrapped child elements to insert. Falsy and empty wrappers are skipped.
     */
    prepend(...children: Wrap<any>[]): Wrap<T> {
        this.el?.prepend(...children.filter(w => w?.ok).map(w => w.el));
        return this;
    }

    /**
     * Append the underlying element as the last child to the specified parent.
     * @param parent Wrapper of the new parent for the element.
     */
    appendTo(parent: Wrap<any>): Wrap<T> {
        if (this.el && parent.el) {
            parent.el.appendChild(this.el);
        }
        return this;
    }

    /**
     * Append the specified elements as children to the underlying element.
     * @param children Wrapped child elements to add. Falsy and empty wrappers are skipped.
     */
    append(...children: (false | null | undefined | Wrap<any>)[]): Wrap<T> {
        this.el?.append(...children.filter(w => w && w.ok).map(w => (w as Wrap<any>).el));
        return this;
    }

    /**
     * Remove the underlying element from the DOM and from this wrapper.
     */
    remove(): Wrap<T> {
        this.el?.parentNode?.removeChild(this.el);
        this.el = undefined;
        return this;
    }

    /**
     * Add the specified classes to the underlying element.
     * @param classes Class(es) to add. Falsy values are ignored.
     */
    classes(...classes: (false | null | undefined | string)[]): Wrap<T> {
        return this.setClasses(true, ...classes);
    }

    /**
     * Remove the provided class or classes from the underlying element.
     * @param classes Class(es) to remove. Falsy values are ignored.
     */
    noClasses(...classes: (false | null | undefined | string)[]): Wrap<T> {
        return this.setClasses(false, ...classes);
    }

    /**
     * Adds or removes the specified classes to/from the underlying element.
     * @param add Whether to add (true) or remove (false) the specified classes.
     * @param classes Class(es) to add/remove. Falsy values are ignored.
     */
    setClasses(add: boolean, ...classes: any[]): Wrap<T> {
        if (this.el) {
            classes
                ?.filter(c => !!c)
                .map(c => `comentario-${c}`)
                .forEach(s => add ? this.el!.classList.add(s) : this.el!.classList.remove(s));
        }
        return this;
    }

    /**
     * Bind a handler to the onClick event of the underlying element.
     * @param handler Handler to bind (non-function value will be ignored).
     */
    click(handler?: (target: Wrap<T>, e: MouseEvent) => void): Wrap<T> {
        return this.on('click', handler);
    }

    /**
     * Bind a handler to the onKeydown event of the underlying element.
     * @param handler Handler to bind.
     */
    keydown(handler: (target: Wrap<T>, e: KeyboardEvent) => void): Wrap<T> {
        return this.on('keydown', handler);
    }

    /**
     * Bind a handler to the animation end and cancel events of the underlying element.
     * @param handler Handler to bind.
     */
    animated(handler: (target: Wrap<T>, e: AnimationEvent) => void): Wrap<T> {
        return this.on('animationend', handler).on('animationcancel', handler);
    }

    /**
     * Bind a handler to the given event of the underlying element.
     * @param type Event type to bind the handler to.
     * @param handler Handler to bind (non-function value doesn't cause the handler to be bound).
     * @param once Whether to remove the listener once it's invoked.
     */
    on<E extends keyof HTMLElementEventMap>(type: E, handler?: (target: Wrap<T>, ev: HTMLElementEventMap[E]) => void, once?: boolean): Wrap<T> {
        if (typeof handler === 'function') {
            this.el?.addEventListener(type, e => handler(this, e as HTMLElementEventMap[E]), {once});
        }
        return this;
    }

    /**
     * Set the value of the checked property of the underlying (input) element.
     * @param b New value of checked.
     */
    checked(b: boolean): Wrap<T> {
        if (this.el) {
            (this.el as unknown as HTMLInputElement).checked = b;
        }
        return this;
    }

    /**
     * Set the value of the disabled property of the underlying (button) element.
     * @param b New value of disabled.
     */
    disabled(b: boolean | null | undefined): Wrap<T> {
        this.attr({disabled: b ? '' : undefined});
        return this;
    }

    /**
     * Focus the underlying element.
     */
    focus(): Wrap<T> {
        this.el?.focus();
        return this;
    }

    /**
     * Scroll to the underlying element.
     */
    scrollTo(): Wrap<T> {
        if (this.el) {
            setTimeout(
                () => !this.vertVisible() && this.el?.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'}),
                100);
        }
        return this;
    }

    /**
     * Run the provided handler in the case there's no underlying element.
     * @param handler Handler to run.
     */
    else(handler: () => void): Wrap<T> {
        if (!this.el) {
            handler();
        }
        return this;
    }

    /**
     * Return a value of the attribute of the underlying element with the given name.
     * @param attrName Attribute name.
     */
    getAttr(attrName: string): string | undefined {
        return this.el?.attributes.getNamedItem(attrName)?.value;
    }

    /**
     * Whether the underlying element has the given class.
     * @param c Class to check for.
     */
    hasClass(c: string): boolean {
        return !!this.el?.classList.contains(`comentario-${c}`);
    }

    /**
     * Show a spinner on the underlying element while invoking an asynchronous worker routine.
     * @param worker Worker callback.
     * @return Whatever the worker has returned.
     */
    async spin<R>(worker: () => Promise<R>): Promise<R> {
        // Disable and add a spinner
        this.disabled(true).classes('spinner');
        try {
            // Invoke the worker callback
            return await worker();
        } finally {
            // Re-enable and remove the spinner
            this.disabled(false).noClasses('spinner');
        }
    }

    /**
     * Return whether the underlying element is fully visible on the screen along its vertical axis.
     */
    private vertVisible(): boolean {
        const r = this.el?.getBoundingClientRect();
        return !!r && r.top >= 0 && r.bottom <= window.innerHeight;
    }
}
