import { HttpClientError } from './http-client';
import { ApiErrorResponse } from './api';

export type UUID = string;

export type TranslateFunc = (id: string) => string;

export type StringBooleanMap = Record<string, boolean>;

export type AsyncProc = () => Promise<void>;
export type AsyncProcWithArg<T> = (arg: T) => Promise<void>;

/** Federated identity provider info */
export interface FederatedIdentityProvider {
    /** Provider ID */
    readonly id: string;
    /** Provider display name */
    readonly name: string;
    /** Provider icon name */
    readonly icon: string;
}

/** User abstraction. **/
export interface User {
    readonly id:          UUID;    // Unique user ID
    readonly email:       string;  // Email address of the user
    readonly name:        string;  // Full name of the user
    readonly websiteUrl:  string;  // URL of the user's website
    readonly hasAvatar:   boolean; // Whether the user has an avatar image
    readonly isModerator: boolean; // Whether the user is a moderator on this specific domain
    readonly isCommenter: boolean; // Whether the user is a commenter on this specific domain (false means the user is read-only)
    readonly colourIndex: number;  // Colour hash, number based on the user's ID
}

/** Authenticated or anonymous user. */
export interface Principal extends User {
    readonly isSuperuser:         boolean; // Whether the user is a "superuser" (instance admin)
    readonly isLocal:             boolean; // Whether the user is authenticated locally (as opposed to via a federated identity provider)
    readonly isSso:               boolean; // Whether the user is authenticated via SSO
    readonly isConfirmed:         boolean; // Whether the user has confirmed their email address
    readonly isOwner:             boolean; // Whether the user is an owner of the domain
    readonly notifyReplies:       boolean; // Whether the user is to be notified about replies to their comments
    readonly notifyModerator:     boolean; // Whether the user is to receive moderator notifications
    readonly notifyCommentStatus: boolean; // Whether the user is to be notified about status changes (approved/rejected) of their comments
}

/** Comment residing on a page. */
export interface Comment {
    readonly id:             UUID;    // Unique record ID
    readonly parentId?:      UUID;    // Parent record ID, null if it's a root comment on the page
    readonly pageId:         UUID;    // ID of the page
    readonly markdown:       string;  // Comment text in markdown
    readonly html?:          string;  // Rendered comment text in HTML
    readonly score:          number;  // Comment score
    readonly isSticky:       boolean; // Whether the comment is sticky (attached to the top of page)
    readonly isApproved:     boolean; // Whether the comment is approved and can be seen by everyone
    readonly isPending:      boolean; // Whether the comment is pending moderator approval
    readonly isDeleted:      boolean; // Whether the comment is marked as deleted
    readonly createdTime:    string;  // When the comment was created
    readonly moderatedTime?: string;  // When the comment was moderated
    readonly deletedTime?:   string;  // When the comment was deleted (deleted comment only)
    readonly editedTime?:    string;  // When the comment was last edited (edited comments only)
    readonly userCreated?:   UUID;    // ID of the user who created the comment. Undefined if the user has since been deleted
    readonly userModerated?: UUID;    // ID of the user who moderated the comment. Undefined if the comment was moderated by another user and the current user isn't a moderator
    readonly userDeleted?:   UUID;    // ID of the user who deleted the comment (deleted comment only). Undefined if the comment was deleted by another user and the current user isn't a moderator
    readonly userEdited?:    UUID;    // ID of the user who last edited the comment (edited comment only). Undefined if the comment was edited by another user and the current user isn't a moderator
    readonly authorName?:    string;  // Name of the author, in case the user isn't registered
    readonly direction:      number;  // Vote direction for the current user
}

/** Stripped-down, read-only version of the user who authored a comment. For now equivalent to User. */
export type Commenter = User;

/** Information about a page displaying comments */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PageInfo {
    /** Base Documentation URL */
    readonly baseDocsUrl: string;
    /** Terms of Service page URL */
    readonly termsOfServiceUrl: string;
    /** Privacy Policy page URL */
    readonly privacyPolicyUrl: string;
    /** Comentario version */
    readonly version: string;
    /** Default interface language ID */
    readonly defaultLangId: string;
    /** Whether the Live update is enabled globally */
    readonly liveUpdateEnabled: boolean;
    /** Domain ID */
    readonly domainId: string;
    /** Domain display name */
    readonly domainName: string;
    /** Page ID */
    readonly pageId: string;
    /** Whether the domain is readonly (no new comments are allowed) */
    readonly isDomainReadonly: boolean;
    /** Whether the page is readonly (no new comments are allowed) */
    readonly isPageReadonly: boolean;
    /** Whether anonymous/unregistered comments are allowed */
    readonly authAnonymous: boolean;
    /** Whether local authentication is allowed */
    readonly authLocal: boolean;
    /** Whether SSO authentication is allowed */
    readonly authSso: boolean;
    /** SSO provider URL */
    readonly ssoUrl: string;
    /** Whether to use a non-interactive SSO login */
    readonly ssoNonInteractive: boolean;
    /** Default comment sort */
    readonly defaultSort: CommentSort;
    /** List of enabled federated identity providers */
    readonly idps?: FederatedIdentityProvider[];
    /** Whether comment authors are allowed to delete their comments */
    readonly commentDeletionAuthor: boolean;
    /** Whether domain moderators are allowed to delete comments */
    readonly commentDeletionModerator: boolean;
    /** Whether comment authors are allowed to edit their comments */
    readonly commentEditingAuthor: boolean;
    /** Whether domain moderators are allowed to edit comments */
    readonly commentEditingModerator: boolean;
    /** Whether voting on comments is enabled */
    readonly enableCommentVoting: boolean;
    /** Whether comment RSS feeds are enabled */
    readonly enableRss: boolean;
    /** Whether deleted comments should be shown */
    readonly showDeletedComments: boolean;
    /** Maximum comment text length */
    readonly maxCommentLength: number;
    /** Whether new users can register locally (with email and password) */
    readonly localSignupEnabled: boolean;
    /** Whether new users can register via a federated identity provider */
    readonly federatedSignupEnabled: boolean;
    /** Whether new users can register via SSO */
    readonly ssoSignupEnabled: boolean;
    /** Whether images are enabled in Markdown */
    readonly markdownImagesEnabled: boolean;
    /** Whether links are enabled in Markdown */
    readonly markdownLinksEnabled: boolean;
    /** Whether tables are enabled in Markdown */
    readonly markdownTablesEnabled: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PageInfo {

    constructor(src: PageInfo) {
        Object.assign(this, src);
    }

    /** Whether the page is read-only. */
    get isReadonly(): boolean {
        return this.isDomainReadonly || this.isPageReadonly;
    }

    /**
     * Whether there's any auth method enabled.
     * @param interactiveOnly Whether only interactive login methods are in scope.
     */
    hasAuthMethod(interactiveOnly: boolean): boolean {
        return this.authAnonymous ||
            this.authLocal ||
            this.authSso && !(interactiveOnly && this.ssoNonInteractive) ||
            !!this.idps?.length;
    }

    /** Whether non-interactive SSO is enabled. */
    get hasNonInteractiveSso(): boolean {
        return this.authSso && this.ssoNonInteractive;
    }
}

/** Commenter users mapped by their IDs. There will be no entry for a commenter that corresponds to a deleted user. */
export type CommenterMap = Record<UUID, Commenter | undefined>;

export type ComparatorFunc<T> = (a: T, b: T) => number;

/** Comment sorting. 1st letter defines the property, 2nd letter the direction. */
export type CommentSort = 'ta' | 'td' | 'sa' | 'sd';

/** Login choices available for the user in the Login dialog. */
export enum LoginChoice {
    /** Signup (registration) instead of login. */
    signup,
    /** Authentication with email and password. */
    localAuth,
    /** Federated (external) authentication, which includes SSO. */
    federatedAuth,
    /** Unregistered commenting, with an optional name. */
    unregistered,
}

/** The result of running the Login dialog. */
export interface LoginData {
    /** User's choice in the dialog. */
    readonly choice: LoginChoice;
    /** Federated ID provider ID in case choice === federatedAuth. */
    readonly idp?: string;
    /** User's email in case choice === localAuth. */
    readonly email?: string;
    /** User's password in case choice === localAuth. */
    readonly password?: string;
    /** User name in case choice === unregistered. */
    readonly userName?: string;
}

/** The result of running the Signup dialog. */
export interface SignupData {
    readonly email:       string;
    readonly name:        string;
    readonly password:    string;
    readonly websiteUrl?: string;
}

export interface UserSettings {
    notifyModerator:     boolean; // Whether to send moderator notifications to the user
    notifyReplies:       boolean; // Whether to send reply notifications to the user
    notifyCommentStatus: boolean; // Whether to send comment status notifications to the user
}

export const ANONYMOUS_ID: UUID = '00000000-0000-0000-0000-000000000000';

export const CommentSortComparators: Record<CommentSort, ComparatorFunc<Comment>> = {
    sa: (a, b) => a.score - b.score,
    sd: (a, b) => b.score - a.score,
    td: (a, b) => b.createdTime.localeCompare(a.createdTime),
    ta: (a, b) => a.createdTime.localeCompare(b.createdTime),
};

/** Generic message displayed to the user. */
export interface Message {
    readonly severity: 'ok' | 'error'; // Message severity
    readonly text:     string;         // Message text
    readonly details?: string;         // Optional technical details
}

/**
 * Message variant signifying a success.
 */
export class OkMessage implements Message {

    readonly severity = 'ok';

    constructor(
        readonly text: string,
    ) {}
}

/**
 * Message variant signifying an error.
 */
export class ErrorMessage implements Message {

    readonly severity = 'error';

    constructor(
        readonly text: string,
        readonly details?: string,
    ) {}

    /**
     * Instantiate a new ErrorMessage instance from the given error object. For now, only handle a string and an HTTP
     * error in a special way.
     * @param err Source error object.
     * @param t Translation function for messages, undefined if not available.
     */
    static of(err: any, t?: TranslateFunc): ErrorMessage {
        let text = t?.('errorUnknown') || 'Unknown error';

        if (typeof err === 'string') {
            text = err;

        } else if (err instanceof HttpClientError) {
            // If there's a response, try to parse it as JSON
            let resp: ApiErrorResponse | undefined;
            if (typeof err.response === 'string') {
                try {
                    resp = JSON.parse(err.response);
                } catch {
                    // Do nothing
                }
            }

            // Translate error ID
            switch (resp?.id) {
                case 'unknown-host':
                    text = t?.('errorUnknownHost') || resp.id;
                    break;

                // Not a known error ID
                default:
                    text = resp?.message || err.message || text;
                    if (resp?.details) {
                        text += ` (${resp.details})`;
                    }
            }
        }

        // Details will be a JSON representation of the error
        return new ErrorMessage(text, JSON.stringify(err, undefined, 2));
    }
}

export interface SsoLoginResponse {
    /** Message type */
    readonly type: 'auth.sso.result';
    /** Whether the login was successful */
    readonly success: boolean;
    /** Any error message returned by the identity provider. */
    readonly error?: string;
}

export interface WebhookBody {
	/** Username */
	readonly username?: string;
	/** URL of the avatar for this Webhook */
	readonly avatar_url?: string;
	/** List of embeds */
	readonly embeds?: {
		/** Title of the embed */
		readonly title?: string;
		/** Description text */
		readonly description?: string;
		/** Embed color */
		readonly color?: number;
		/** Embed fields */
		readonly fields?: {
			/** Field name */
			readonly name: string;
			/** Field value */
			readonly value: string;
		}[];
		/** Footer */
		readonly footer?: {
			/** Footer text */
			readonly text: string;
		};
		/** Timestamp */
		readonly timestamp?: string;
	}[];
}
