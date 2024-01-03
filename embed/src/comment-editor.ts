import { Wrap } from './element-wrap';
import { UIToolkit } from './ui-toolkit';
import { InstanceConfig, PageInfo } from './models';
import { Utils } from './utils';

export type CommentEditorCallback = (ce: CommentEditor) => void;
export type CommentEditorPreviewCallback = (markdown: string) => Promise<string>;

export class CommentEditor extends Wrap<HTMLFormElement>{

    private readonly cbAnonymous?: Wrap<HTMLInputElement>;
    private readonly textarea:     Wrap<HTMLTextAreaElement>;
    private readonly preview:      Wrap<HTMLDivElement>;
    private readonly btnPreview:   Wrap<HTMLButtonElement>;
    private readonly btnSubmit:    Wrap<HTMLButtonElement>;
    private previewing = false;

    /**
     * Create a new editor for editing comment text.
     * @param parent Parent element to host the editor.
     * @param isEdit Whether it's adding a new comment (false) or editing an existing one (true).
     * @param initialText Initial text to insert into the editor.
     * @param isAuthenticated Whether the user is authenticated.
     * @param config Comentario configuration obtained from the backend.
     * @param pageInfo Page data.
     * @param onCancel Cancel callback.
     * @param onSubmit Submit callback.
     * @param onPreview Preview callback.
     */
    constructor(
        private readonly parent: Wrap<any>,
        isEdit: boolean,
        initialText: string,
        isAuthenticated: boolean,
        config: InstanceConfig,
        pageInfo: PageInfo,
        onCancel: CommentEditorCallback,
        onSubmit: CommentEditorCallback,
        private readonly onPreview: CommentEditorPreviewCallback,
    ) {
        super(UIToolkit.form(() => onSubmit(this), () => onCancel(this)).element);

        // "Comment anonymously" checkbox
        let anonContainer: Wrap<any> | undefined;
        if (!isAuthenticated && pageInfo.authAnonymous && !isEdit) {
            this.cbAnonymous = Wrap.new('input').id(`anonymous-${Math.random()}`).attr({type: 'checkbox'});
            // Tick off and disable if only anonymous comments are possible
            if (!pageInfo.authLocal && !pageInfo.authSso && !pageInfo.idps?.length) {
                this.cbAnonymous.checked(true).attr({disabled: 'true'});
            }
            anonContainer = UIToolkit.div('checkbox-container')
                .append(
                    this.cbAnonymous,
                    Wrap.new('label').attr({for: this.cbAnonymous.getAttr('id')}).inner('Comment anonymously'));
        }

        // Set up the form
        this.classes('comment-editor')
            .append(
                // Textarea
                this.textarea = UIToolkit.textarea(null, true, true)
                    .attr({maxlength: '4096'})
                    .value(initialText)
                    .on('input', () => this.textChanged()),
                // Preview
                this.preview = UIToolkit.div('comment-editor-preview', 'hidden'),
                // Textarea footer
                UIToolkit.div('comment-editor-footer')
                    .append(
                        // Markdown help link
                        Wrap.new('a')
                            .html(
                                '<svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 208 128">' +
                                    '<rect width="198" height="118" x="5" y="5" ry="10" stroke="currentColor" stroke-width="10" fill="none"/>' +
                                    '<path fill="currentColor" d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0-30-33h20V30h20v35h20z"/>' +
                                '</svg>')
                            .attr({
                                title: 'Markdown help',
                                href: Utils.joinUrl(
                                    config.staticConfig.baseDocsUrl,
                                    config.staticConfig.defaultLangId,
                                    'kb/markdown/'),
                                target: '_blank'}),
                        // Buttons
                        UIToolkit.div('comment-editor-buttons')
                            .append(
                                // Anonymous checkbox, if any
                                anonContainer,
                                // Cancel
                                UIToolkit.button('Cancel', () => onCancel(this)),
                                // Preview
                                this.btnPreview = UIToolkit.button('Preview', () => this.togglePreview(), 'secondary-button'),
                                // Submit
                                this.btnSubmit = UIToolkit.submit(isEdit ? 'Save Changes' : 'Add Comment', false),
                            )));

        // Update the parent
        this.parent.classes('editor-inserted').prepend(this);

        // Update the buttons
        this.textChanged();

        // Focus the textarea
        this.textarea.focus();
    }

    /**
     * Whether the Comment anonymously checkbox is ticked off.
     */
    get anonymous(): boolean {
        return !!this.cbAnonymous?.isChecked;
    }

    /**
     * Markdown text entered in the editor, trimmed of all leading and trailing whitespace.
     */
    get markdown(): string {
        return this.textarea.val.trim();
    }

    /**
     * Update the parent on editor removal.
     */
    override remove(): CommentEditor {
        this.parent.noClasses('editor-inserted');
        return super.remove() as CommentEditor;
    }

    private async togglePreview() {
        // Toggle the value
        this.previewing = !this.previewing;

        // Hide the textarea and show the preview in the preview mode
        this.textarea.setClasses(this.previewing, 'hidden');
        this.preview.setClasses(!this.previewing, 'hidden');

        // Update the button
        this.btnPreview.setClasses(this.previewing, 'button-active');

        // Request a comment text rendering
        let html = '';
        if (this.previewing) {
            try {
                html = await this.onPreview(this.markdown);
            } catch (e: any) {
                html = `Preview failed: ${e.message || '(unknown error)'}`;
            }
        }
        this.preview.html(html);

        // Focus the editor after leaving the preview
        if (!this.previewing) {
            this.textarea.focus();
        }
    }

    private textChanged() {
        // Disable the preview/submit buttons if the text is empty
        const attr = {disabled: this.markdown ? undefined : 'disabled'};
        this.btnPreview.attr(attr);
        this.btnSubmit.attr(attr);
    }
}
