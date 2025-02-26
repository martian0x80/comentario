import { ApiService } from './api';
import { Utils } from './utils';

/**
 * Web component interface, declared here for the lack of one provided by Typescript DOM lib.
 */
export interface WebComponent {

    /**
     * Called by the browser when the element is added to the DOM.
     */
    connectedCallback: () => void;

    /**
     * Called by the browser when the element is removed from the DOM.
     */
    disconnectedCallback: () => void;

    /**
     * Called by the browser when one of the observed attributes has changed.
     */
    attributeChangedCallback?: (name: string, oldValue: string | null, newValue: string | null) => void;
}

/**
 * Base class for components capable of talking to Comentario via its API.
 */
export class ComentarioBase extends HTMLElement {

    /** Origin URL, injected by the backend on serving the file. */
    protected readonly origin = 'https://chat.crunchycomments.com';

    /** CDN URL, injected by the backend on serving the file. */
    protected readonly cdn = 'https://chat.crunchycomments.com';

    /** Service handling API requests. */
    protected readonly apiService = new ApiService(Utils.joinUrl(this.origin, 'api'));

    /**
     * Location of the current page.
     *
     * Note. The below is kinda hacky: it detects whether it's running under Cypress (e2e tests), which runs the web app
     * inside an iframe. Not quite sure why otherwise the parent should be used, it comes from the legacy code.
     */
    protected readonly location: Location = (parent as any)['Cypress'] ? window.location : parent.location;
}
