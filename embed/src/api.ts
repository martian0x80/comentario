import { Comment, Commenter, IdentityProvider, PageInfo, Principal, UUID } from './models';
import { HttpClient } from './http-client';

export interface ApiErrorResponse {
    readonly id?:      string;
    readonly message?: string;
    readonly details?: string;
}

export interface ApiClientConfigResponse {
    readonly baseUrl:       string;
    readonly signupAllowed: boolean;
    readonly federatedIdps: IdentityProvider[];
}

export interface ApiCommentListResponse {
    readonly pageInfo:   PageInfo;    // Page info
    readonly comments:   Comment[];   // Comments on the page
    readonly commenters: Commenter[]; // Commenters, who authored comments on the page
}

export interface ApiCommentNewResponse {
    readonly comment:   Comment;   // Added comment
    readonly commenter: Commenter; // Commenter that corresponds to the current user
}

export interface ApiCommentUpdateResponse {
    readonly comment: Comment;
}

export interface ApiCommentVoteResponse {
    readonly score: number;
}

export interface ApiCommenterSignupResponse {
    readonly isConfirmed: boolean; // Whether the user has been immediately confirmed
}

/**
 * @deprecated
 */
export interface ApiCommenterTokenNewResponse {
    readonly commenterToken: string;
}

export interface ApiCommenterLoginResponse {
    readonly sessionToken: string;    // Session token to authenticate subsequent API requests with
    readonly principal:    Principal; // Authenticated principal
}

export class ApiService {

    /** Base64-encoded representation of a 32-byte zero-filled array (2 zero UUIDs). */
    static readonly AnonymousUserSessionToken = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    /** User/session token to authenticate requests with. */
    private userSessionToken?: string;

    /** Authenticated principal, if any. */
    private principal?: Principal;

    /** HTTP client we'll use for API requests. */
    private readonly apiClient = new HttpClient(this.basePath);

    constructor(
        readonly basePath: string,
        private readonly doc: Document,
    ) {}

    /**
     * Return the currently authenticated principal or undefined if the user isn't authenticated.
     */
    async getPrincipal(): Promise<Principal | undefined> {
        // If there's an authenticated principal, return it
        if (this.principal) {
            return this.principal;
        }

        // If there's no session token, try to restore it from the cookie
        if (this.userSessionToken === undefined) {
            this.userSessionToken = this.restoreSessionToken();
        }

        // If only an anonymous session is available, resolve to undefined
        if (this.userSessionToken === ApiService.AnonymousUserSessionToken) {
            return undefined;
        }

        // Retrieve the currently authenticated principal, if any
        try {
            this.principal = await this.apiClient.post<Principal | undefined>('commenter/self', this.userSessionToken);
        } catch (e) {
            // On any error consider the user unauthenticated
            console.error(e);
        }

        // User isn't authenticated
        if (!this.principal) {
            this.userSessionToken = ApiService.AnonymousUserSessionToken;
            this.storeSessionToken();
        }
        return this.principal;
    }

    /**
     * Obtain client configuration.
     */
    async configClientGet(): Promise<ApiClientConfigResponse> {
        return this.apiClient.get<ApiClientConfigResponse>('config/client');
    }

    /**
     * Sign a commenter in.
     * @param email Commenter's email.
     * @param password Commenter's password.
     * @param host Host the commenter is signing in on.
     */
    async commenterLogin(email: string, password: string, host: string): Promise<void> {
        const r = await this.apiClient.post<ApiCommenterLoginResponse>('commenter/login', undefined, {email, password, host});
        this.userSessionToken = r.sessionToken;
        this.principal        = r.principal;
        this.storeSessionToken();
    }

    /**
     * Log the currently signed-in commenter out.
     */
    async commenterLogout(): Promise<void> {
        await this.apiClient.post<void>('commenter/logout', this.userSessionToken);
        this.userSessionToken = ApiService.AnonymousUserSessionToken;
        this.principal        = undefined;
        this.storeSessionToken();
    }

    /**
     * Sign up as a new commenter. Return whether the user has been immediately confirmed.
     * @param email User's email.
     * @param name User's full name.
     * @param password User's password.
     * @param websiteUrl Optional website URL of the user.
     * @param url URL the user signed up on.
     */
    async commenterSignup(email: string, name: string, password: string, websiteUrl: string | undefined, url: string): Promise<boolean> {
        const r = await this.apiClient.post<ApiCommenterSignupResponse>('commenter/signup', undefined, {email, name, password, websiteUrl, url});
        return r.isConfirmed;
    }

    /**
     * Delete a comment.
     * @param id ID of the comment to delete.
     */
    async commentDelete(id: UUID): Promise<void> {
        return this.apiClient.delete<void>(`comments/${id}`, this.userSessionToken);
    }

    /**
     * Get a list of comments and commenters for the given host/path combination.
     * @param host Host the comments reside on.
     * @param path Path of the page the comments reside on.
     */
    async commentList(host: string, path: string): Promise<ApiCommentListResponse> {
        return this.apiClient.post<ApiCommentListResponse>('comments', this.userSessionToken, {host, path});
    }

    /**
     * Moderate a comment.
     * @param id ID of the comment to moderate.
     * @param approve Whether to approve the comment
     */
    async commentModerate(id: UUID, approve: boolean): Promise<void> {
        return this.apiClient.post<void>(`comments/${id}/moderate`, this.userSessionToken, {approve});
    }

    /**
     * Add a new comment.
     * @param host Host the page resides on.
     * @param path Path to the page to create a comment on.
     * @param parentId Optional ID of the parent comment for the new one. If omitted, a root comment will be added.
     * @param markdown Comment text in the markdown format.
     */
    async commentNew(host: string, path: string, parentId: UUID | undefined, markdown: string): Promise<ApiCommentNewResponse> {
        return this.apiClient.put<ApiCommentNewResponse>('comments', this.userSessionToken, {host, path, parentId, markdown});
    }

    /**
     * Update an existing comment.
     * @param id ID of the comment to update.
     * @param markdown Comment text in the markdown format.
     */
    async commentUpdate(id: UUID, markdown: string): Promise<ApiCommentUpdateResponse> {
        return this.apiClient.put<ApiCommentUpdateResponse>(`comments/${id}`, this.userSessionToken, {markdown});
    }

    /**
     * Vote for specified comment.
     * @param id ID of the comment to update.
     * @param direction Vote direction
     */
    async commentVote(id: UUID, direction: -1 | 0 | 1): Promise<ApiCommentVoteResponse> {
        return this.apiClient.post<ApiCommentVoteResponse>(`comments/${id}`, this.userSessionToken, {direction});
    }

    /**
     * Retrieve a session token of the authenticated user, if any.
     */
    private restoreSessionToken(): UUID | undefined {
        return `; ${this.doc.cookie}`.split('; comentario_auth_token=').pop()?.split(';').shift() || undefined;
    }

    /**
     * Store or remove a session token of the authenticated user in a cookie.
     */
    private storeSessionToken() {
        // If the value is provided, set the cookie expiration date one year in the future. Otherwise expire the cookie
        // right away
        let exp = 'Thu, 01 Jan 1970 00:00:01 GMT';
        if (this.userSessionToken) {
            const date = new Date();
            date.setTime(date.getTime() + (365 * 24 * 60 * 60 * 1000));
            exp = date.toUTCString();
        }

        // Store the cookie
        this.doc.cookie = `comentario_auth_token=${this.userSessionToken || ''}; expires=${exp}; path=/`;
    }
}
