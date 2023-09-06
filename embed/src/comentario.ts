import {
    ANONYMOUS_ID,
    Comment,
    CommenterMap,
    CommentsGroupedById,
    CommentSort,
    DefaultInstanceConfig,
    ErrorMessage,
    Message,
    OkMessage,
    PageInfo,
    Principal,
    SignupData,
    SsoLoginResponse,
    StringBooleanMap,
    User,
    UserSettings,
    UUID,
} from './models';
import { ApiCommentListResponse, ApiService } from './api';
import { Wrap } from './element-wrap';
import { UIToolkit } from './ui-toolkit';
import { CommentCard, CommentRenderingContext, CommentTree } from './comment-card';
import { CommentEditor } from './comment-editor';
import { ProfileBar } from './profile-bar';
import { SortBar } from './sort-bar';
import { Utils } from './utils';

export class Comentario extends HTMLElement {

    /** Origin URL, injected by the backend on serving the file. */
    private readonly origin = '[[[.Origin]]]';
    /** CDN URL, injected by the backend on serving the file. */
    private readonly cdn = '[[[.CdnPrefix]]]';

    /** Service handling API requests. */
    private readonly apiService = new ApiService(
        `${this.origin}/api`,
        this.ownerDocument,
        () => this.setMessage(),
        err => this.setMessage(ErrorMessage.of(err)));

    /**
     * Location of the current page.
     *
     * Note. The below is kinda hacky: it detects whether it's running under Cypress (e2e tests), which runs the web app
     * inside an iframe. Not quite sure why otherwise the parent should be used, it comes from the legacy code.
     */
    private readonly location: Location = (parent as any)['Cypress'] ? window.location : parent.location;

    /** The root element of Comentario embed. */
    private readonly root = Wrap.new('div').appendTo(new Wrap(this));

    /** Comentario config obtained from the backend. */
    private config = DefaultInstanceConfig;

    /** Message panel (only shown when needed). */
    private messagePanel?: Wrap<HTMLDivElement>;

    /** User profile toolbar. */
    private profileBar?: ProfileBar;

    /** Main area panel. */
    private mainArea?: Wrap<HTMLDivElement>;

    /** Container for hosting the Add comment editor. */
    private addCommentHost?: Wrap<HTMLDivElement>;

    /** Currently active comment editor instance. */
    private editor?: CommentEditor;

    /** Comments panel inside the mainArea. */
    private commentsArea?: Wrap<HTMLDivElement>;

    /** Map of commenters by their ID. */
    private readonly commenters: CommenterMap = {};

    /** Map of loaded CSS stylesheet URLs. */
    private readonly loadedCss: StringBooleanMap = {};

    /** Map of comments, grouped by their ID. */
    private parentIdMap?: CommentsGroupedById;

    /** Currently authenticated principal or undefined if the user isn't authenticated. */
    private principal?: Principal;

    /** Current page info as retrieved from the server. */
    private pageInfo?: PageInfo;

    /** Currently applied comment sort. */
    private commentSort: CommentSort = 'sd';

    /** Path of the page for loading comments. Defaults to the actual path on the host. */
    private readonly pagePath = this.getAttribute('page-id') || this.location.pathname;

    /**
     * Optional CSS stylesheet URL that gets loaded after the default one. Setting to 'false' disables loading any CSS
     * altogether.
     */
    private readonly cssOverride = this.getAttribute('css-override');

    /** Whether fonts should be applied to the entire Comentario container. */
    private readonly noFonts = this.getAttribute('no-fonts') === 'true';

    /** Whether to automatically initialise the Comentario engine on the current page. */
    private readonly autoInit = this.getAttribute('auto-init') !== 'false';

    constructor() {
        super();
        // If automatic initialisation is activated (default), run Comentario
        if (this.autoInit) {
            this.main();
        }
    }

    /**
     * The main worker routine of Comentario
     * @return Promise that resolves as soon as Comentario setup is complete
     */
    async main(): Promise<void> {
        // If CSS isn't disabled altogether
        if (this.cssOverride !== 'false') {
            try {
                // Begin by loading the stylesheet
                await this.cssLoad(`${this.cdn}/comentario.css`);

                // Load stylesheet override, if any
                if (this.cssOverride) {
                    await this.cssLoad(this.cssOverride);
                }
            } catch (e) {
                // Do not block Comentario load on CSS load failure, but log the error to the console
                console.error(e);
            }
        }

        // Load Comentario configuration
        this.config = await this.apiService.configGet();

        // Set up the root content
        this.root
            .classes('root', !this.noFonts && 'root-font')
            .append(
                // Profile bar
                this.profileBar = new ProfileBar(
                    this.origin,
                    this.root,
                    this.config,
                    () => this.createAvatarElement(this.principal),
                    (email, password) => this.authenticateLocally(email, password),
                    idp => this.oAuthLogin(idp),
                    data => this.signup(data),
                    data => this.saveUserSettings(data)),
                // Main area
                this.mainArea = UIToolkit.div('main-area'),
                // Footer
                UIToolkit.div('footer')
                    .append(
                        UIToolkit.div('logo-container')
                            .append(
                                Wrap.new('a')
                                    .attr({href: 'https://comentario.app/', target: '_blank'})
                                    .html('Powered by ')
                                    .append(Wrap.new('span').classes('logo-brand').inner('Comentario')))));

        // Load information about ourselves
        await this.updateAuthStatus();

        // Load the UI
        await this.reload();

        // Scroll to the requested comment, if any
        this.scrollToCommentHash();
        console.info(`Initialised Comentario ${this.config.staticConfig.version}`);
    }

    /**
     * Return a rejected promise with the given message.
     * @param message Message to reject the promise with.
     */
    private reject(message: string): Promise<never> {
        return Promise.reject(`Comentario: ${message}`);
    }

    /**
     * Load the stylesheet with the provided URL into the DOM
     * @param url Stylesheet URL.
     */
    cssLoad(url: string): Promise<void> {
        // Don't bother if the stylesheet has been loaded already
        return this.loadedCss[url] ?
            Promise.resolve() :
            new Promise((resolve, reject) => {
                this.loadedCss[url] = true;
                Wrap.new('link')
                    .attr({href: url, rel: 'stylesheet', type: 'text/css'})
                    .on('load', () => resolve())
                    .on('error', (_, e) => reject(e))
                    .appendTo(new Wrap(this.ownerDocument.head));
            });
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Explicitly initiate non-interactive SSO login. Supposed to be called externally, for example:
     * ```
     * $('comentario-comments').nonInteractiveSsoLogin();
     * ```
     * @public
     */
    async nonInteractiveSsoLogin(): Promise<void> {
        // Verify non-interactive SSO is enabled
        if (!this.pageInfo?.authSso || !this.pageInfo.ssoNonInteractive) {
            return this.reject('Non-interactive SSO is not enabled.');
        }

        // Hand over to the login routine
        await this.oAuthLogin('sso');
    }

    /**
     * Reload the app UI.
     */
    private async reload() {
        // Fetch page data and comments
        await this.loadPageData();

        // Update the main area
        this.setupMainArea();

        // Render the comments
        this.renderComments();
    }

    /**
     * Scroll to the comment whose ID is provided in the current window's fragment (if any).
     */
    private scrollToCommentHash() {
        const h = this.location.hash;

        // If the hash starts with a valid ID
        if (h?.startsWith('#comentario-')) {
            this.scrollToComment(h.substring(12));

        } else if (h?.startsWith('#comentario')) {
            // If we're requested to scroll to the comments in general
            this.root.scrollTo();
        }
    }

    /**
     * Scroll to the comment with the specified ID.
     * @param id Comment ID to scroll to.
     */
    private scrollToComment(id: UUID) {
        Wrap.byId(id)
            .classes('bg-highlight')
            .scrollTo()
            .else(() => {
                // Make sure it's a valid ID before showing the user a message
                if (Utils.isUuid(id)) {
                    this.setMessage(new ErrorMessage('The comment you\'re looking for doesn\'t exist; possibly it was deleted.'));
                }
            });
    }

    /**
     * (Re)render all comments recursively, adding them to the comments area.
     */
    private renderComments() {
        this.commentsArea!
            .html('')
            .append(...new CommentTree().render(this.makeCommentRenderingContext()));
    }

    /**
     * Set and display (message is given) or clean (message is falsy) a message in the message panel.
     * @param message Message object to set. If undefined, the error panel gets removed.
     */
    private setMessage(message?: Message) {
        // Remove any existing message
        this.messagePanel?.remove();
        this.messagePanel = undefined;

        // No message means remove any message
        if (!message) {
            return;
        }

        // Determine message severity
        const err = message.severity === 'error';

        // Create a message panel
        this.root.prepend(
            this.messagePanel = UIToolkit.div('message-box')
                .classes(err && 'error')
                // Message text
                .append(UIToolkit.div('text-center').inner(err ? `Error: ${message.text}.` : message.text)));

        // If there are details
        if (message.details) {
            const details = Wrap.new('pre').classes('hidden').inner(message.details);
            let hidden = true;
            this.messagePanel.append(
                // Details toggle link
                Wrap.new('div').append(
                    Wrap.new('a').classes('small').inner('Details ▾').click(() => details.setClasses(hidden = !hidden, 'hidden'))),
                // Details text
                details);
        }

        // Scroll to the message
        this.messagePanel.scrollTo();
    }

    /**
     * Request the authentication status of the current user from the backend, and return a promise that resolves as
     * soon as the status becomes definite.
     */
    private async updateAuthStatus(): Promise<void> {
        this.principal = await this.apiService.authPrincipal();

        // User is authenticated
        if (this.principal) {
            // Update the profile bar
            this.profileBar!.authenticated(this.principal, () => this.logout());

        } else {
            // User isn't authenticated: clean up the profile bar (known auth methods will be set up later)
            this.profileBar!.notAuthenticated();
        }
    }

    /**
     * Create and return a main area element.
     */
    private setupMainArea() {
        // Clean up everything from the main area
        this.mainArea!.html('');
        this.commentsArea = undefined;

        // Add a moderator toolbar, in necessary
        if (this.principal && (this.principal.isSuperuser || this.principal.isOwner || this.principal.isModerator)) {
            this.mainArea!.append(
                UIToolkit.div('mod-tools')
                    .append(
                        // Title
                        Wrap.new('span').classes('mod-tools-title').inner('Moderator tools'),
                        // Lock/Unlock button
                        UIToolkit.button(
                            this.pageInfo?.isPageReadonly ? 'Unlock thread' : 'Lock thread',
                            () => this.pageReadonlyToggle())));
        }

        // If the domain or the page are readonly, add a corresponding message
        if (this.pageInfo?.isDomainReadonly || this.pageInfo?.isPageReadonly) {
            this.mainArea!.append(UIToolkit.div('moderation-notice').inner('This thread is locked. You cannot add new comments.'));

        // Otherwise, add a comment editor host, which will get an editor for creating a new comment
        } else {
            this.mainArea!.append(
                this.addCommentHost = UIToolkit.div('add-comment-host')
                    .attr({tabindex: '0'})
                    // Activate the editor on focus, but only if it isn't active yet
                    .on('focus', t => !t.hasClass('editor-inserted') && this.addComment(undefined)));
        }

        // If there's any comment, add sort buttons
        if (this.parentIdMap) {
            this.mainArea!.append(new SortBar(
                cs => {
                    this.commentSort = cs;
                    // Re-render comments using the new sort
                    this.renderComments();
                },
                this.commentSort));
        }

        // Create a panel for comments
        this.commentsArea = UIToolkit.div('comments').appendTo(this.mainArea!);
    }

    /**
     * Start editing new comment.
     * @param parentCard Parent card for adding a reply to. If falsy, a top-level comment is being added
     */
    private addComment(parentCard?: CommentCard) {
        // Kill any existing editor
        this.cancelCommentEdits();

        // Create a new editor
        this.editor = new CommentEditor(
            parentCard?.children || this.addCommentHost!,
            this.root,
            false,
            '',
            !!this.principal,
            this.config,
            this.pageInfo!,
            () => this.cancelCommentEdits(),
            async editor => await this.submitNewComment(parentCard, editor.markdown, editor.anonymous));
    }

    /**
     * Start editing existing comment.
     * @param card Card hosting the comment.
     */
    private editComment(card: CommentCard) {
        // Kill any existing editor
        this.cancelCommentEdits();

        // Create a new editor
        this.editor = new CommentEditor(
            card,
            this.root,
            true,
            card.comment.markdown!,
            true,
            this.config,
            this.pageInfo!,
            () => this.cancelCommentEdits(),
            async editor => await this.submitCommentEdits(card, editor.markdown));
    }

    /**
     * Submit a new comment to the backend, authenticating the user before if necessary.
     * @param parentCard Parent card for adding a reply to. If falsy, a top-level comment is being added
     * @param markdown Markdown text entered by the user.
     * @param anonymous Whether the user chose to comment anonymously.
     */
    private async submitNewComment(parentCard: CommentCard | undefined, markdown: string, anonymous: boolean): Promise<void> {
        // Authenticate the user, if required
        const auth = !this.pageInfo?.authAnonymous || !anonymous;
        if (!this.principal && auth) {
            await this.profileBar!.loginUser();
        }

        // If we can proceed: user logged in or that wasn't required
        if (this.principal || !auth) {
            // Submit the comment to the backend
            const r = await this.apiService.commentNew(this.location.host, this.pagePath, parentCard?.comment.id, markdown);

            // Make sure parent map exists
            if (!this.parentIdMap) {
                this.parentIdMap = {};
            }

            // Add the comment to the parent map
            const parentId = parentCard?.comment.id ?? '';
            if (parentId in this.parentIdMap) {
                this.parentIdMap[parentId].push(r.comment);
            } else {
                this.parentIdMap[parentId] = [r.comment];
            }

            // Add the commenter to the commenter map
            this.commenters[r.commenter.id] = r.commenter;

            // Remove the editor
            this.cancelCommentEdits();

            // Re-render comments
            this.renderComments();

            // Scroll to the added comment
            this.scrollToComment(r.comment.id);
        }
    }

    /**
     * Submit the entered comment markdown to the backend for saving.
     * @param card Card whose comment is being updated.
     * @param markdown Markdown text entered by the user.
     */
    private async submitCommentEdits(card: CommentCard, markdown: string): Promise<void> {
        // Submit the edits to the backend
        const r = await this.apiService.commentUpdate(card.comment.id, markdown);

        // Update the comment in the card, replacing the original in the parentIdMap and preserving the vote direction
        // (it isn't provided in the returned comment)
        card.comment = this.replaceCommentById(r.comment, {direction: card.comment.direction});

        // Remove the editor
        this.cancelCommentEdits();
    }

    /**
     * Stop editing comment and remove any existing editor.
     */
    private cancelCommentEdits() {
        this.editor?.remove();
    }

    /**
     * Register the user with the given details and log them in.
     * @param data User's signup data.
     */
    private async signup(data: SignupData): Promise<void> {
        // Sign the user up
        const isConfirmed = await this.apiService.authSignup(data.email, data.name, data.password, data.websiteUrl, this.location.href);

        // If the user is confirmed, log them immediately in
        if (isConfirmed) {
            await this.authenticateLocally(data.email, data.password);

        } else {
            // Otherwise, show a message that the user should confirm their email
            this.setMessage(new OkMessage('Account is successfully created. Please check your email and click the confirmation link it contains.'));
        }
    }

    /**
     * Authenticate the user using local authentication (email and password).
     * @param email User's email.
     * @param password User's password.
     */
    private async authenticateLocally(email: string, password: string): Promise<void> {
        // Log the user in
        await this.apiService.authLogin(email, password, this.location.host);

        // Refresh the auth status
        await this.updateAuthStatus();

        // If authenticated, reload all comments and page data
        if (this.principal) {
            await this.reload();
        }
    }

    /**
     * Initiate an OAuth login for the given identity provider, either non-interactively (SSO only) or by opening a new
     * browser popup window for completing authentication. Return a promise that resolves as soon as the user is
     * authenticated, or rejects when the authentication has been unsuccessful.
     * @param idp Identity provider to initiate authentication with.
     */
    private async oAuthLogin(idp: string): Promise<void> {
        // Request a new, anonymous login token
        const token = await this.apiService.authNewLoginToken();
        const url = `${this.apiService.basePath}/oauth/${idp}?host=${encodeURIComponent(this.location.host)}&token=${token}`;

        // If non-interactive SSO is triggered
        if (idp === 'sso' && this.pageInfo?.ssoNonInteractive) {
            await this.loginSsoNonInteractive(url);

        } else {
            // Interactive login: open a popup window
            await this.loginOAuthPopup(url);
        }

        // If the authentication was successful, the token is supposed to be bound to the user now. Use it for login
        await this.apiService.authLoginToken(token, this.location.host);

        // Refresh the auth status
        await this.updateAuthStatus();

        // If authenticated, reload all comments and page data
        if (this.principal) {
            await this.reload();
        }
    }

    /**
     * Try to authenticate the user with non-interactive SSO.
     */
    private async loginSsoNonInteractive(url: string): Promise<void> {
        // Promise resolving as soon as the iframe communicates back
        const ready = new Promise<SsoLoginResponse>((resolve, reject) =>
            window.addEventListener(
                'message',
                (e: MessageEvent<SsoLoginResponse>) => {
                    // Make sure the message originates from the SSO iframe and is a valid response
                    if (e.origin !== url || e.data?.type !== 'auth.sso.result') {
                        return;
                    }

                    // Check if login was successful
                    if (!e.data.success) {
                        reject(e.data.error);

                    } else {
                        // Succeeded
                        resolve(e.data);
                    }
                },
                {once: true}));

        // Time out after 60 seconds
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject('SSO login timed out'), 60_000));

        // Insert an invisible iframe, initiating SSO
        const iframe = Wrap.new('iframe')
            .attr({src: url, style: 'display: none'})
            .appendTo(this.root);

        // Wait until login is complete or timed out
        try {
            await Promise.race([ready, timeout]);
        } catch (e) {
            this.setMessage(ErrorMessage.of(e || 'SSO authentication failed.'));
            throw e;
        } finally {
            iframe.remove();
        }
    }

    /**
     * Open a popup for OAuth login and return a promise that resolves when the popup is closed.
     */
    private async loginOAuthPopup(url: string): Promise<void> {
        // Open a new popup window
        const popup = window.open(url, '_blank', 'popup,width=800,height=600');
        if (!popup) {
            return this.reject('Failed to open OAuth popup');
        }

        // Wait until the popup is closed
        await new Promise<void>(resolve => {
            const interval = setInterval(
                () => {
                    if (popup.closed) {
                        clearInterval(interval);
                        resolve();
                    }
                },
                500);
        });
    }

    /**
     * Log the current user out.
     */
    private async logout(): Promise<void> {
        // Terminate the server session
        await this.apiService.authLogout();
        // Update auth status controls
        await this.updateAuthStatus();
        // Reload the comments and other stuff
        return this.reload();
    }

    /**
     * Load data for the current page URL, including the comments, from the backend and store them locally
     */
    private async loadPageData(): Promise<void> {
        // Retrieve page settings and a comment list from the backend
        let r: ApiCommentListResponse;
        try {
            r = await this.apiService.commentList(this.location.host, this.pagePath);

            // Store page- and backend-related properties
            this.pageInfo = r.pageInfo;
            this.commentSort = r.pageInfo.defaultSort;

            // Configure the page in the profile bar
            this.profileBar!.pageInfo = r.pageInfo;

        } catch (err) {
            // Remove the page from the profile bar on error: this will disable login
            this.profileBar!.pageInfo = undefined;
            throw err;
        }

        // Build a map by grouping all comments by their parentId value
        this.parentIdMap = r.comments?.reduce(
            (m, c) => {
                const pid = c.parentId ?? '';
                if (pid in m) {
                    m[pid].push(c);
                } else {
                    m[pid] = [c];
                }
                return m;
            },
            {} as CommentsGroupedById) || {};

        // Convert commenter list into a map
        r.commenters?.forEach(c => this.commenters[c.id] = c);
    }

    /**
     * Toggle the current page's readonly status.
     */
    private async pageReadonlyToggle(): Promise<void> {
        // Run the status toggle with the backend
        await this.apiService.pageUpdate(this.pageInfo!.pageId, !this.pageInfo?.isPageReadonly);

        // Reload the page to reflect the state change
        return this.reload();
    }

    /**
     * Approve or reject the comment of the given card.
     * @param card Comment card.
     * @param approve Whether to approve (true) or reject (false) the comment.
     */
    private async moderateComment(card: CommentCard, approve: boolean): Promise<void> {
        // Submit the moderation to the backend
        await this.apiService.commentModerate(card.comment.id, approve);

        // Update the comment and the card
        card.comment = this.replaceCommentById(card.comment, {isPending: false, isApproved: approve});
    }

    /**
     * Delete the comment of the given card.
     */
    private async deleteComment(card: CommentCard): Promise<void> {
        // Run deletion with the backend
        await this.apiService.commentDelete(card.comment.id);

        // Update the comment and the card
        card.comment = this.replaceCommentById(card.comment, {isDeleted: true, markdown: '', html: ''});
    }

    /**
     * Toggle the given comment's sticky status.
     */
    private async stickyComment(card: CommentCard): Promise<void> {
        // Run the stickiness update with the API
        const isSticky = !card.comment.isSticky;
        await this.apiService.commentSticky(card.comment.id, isSticky);

        // Update the comment
        this.replaceCommentById(card.comment, {isSticky});

        // Rerender comments to reflect the changed stickiness
        this.renderComments();

        // If sticky status is set, scroll to the comment
        if (isSticky) {
            this.scrollToComment(card.comment.id);
        }
    }

    /**
     * Vote (upvote, downvote, or undo vote) for the given comment.
     */
    private async voteComment(card: CommentCard, direction: -1 | 0 | 1): Promise<void> {
        // Only registered users can vote
        let reloaded = false;
        if (!this.principal) {
            await this.profileBar!.loginUser();

            // Failed to authenticate
            if (!this.principal) {
                return;
            }

            // The original card is gone at this point, because the comment tree is reloaded after the login
            reloaded = true;
        }

        // Run the vote with the backend
        const r = await this.apiService.commentVote(card.comment.id, direction);

        // Update the comment and the card, if there's still one; otherwise reload the tree again (not optimal, but we
        // can't find the card at the moment as we don't store any of them, only the underlying elements)
        if (reloaded) {
            await this.reload();
        } else {
            card.comment = this.replaceCommentById(card.comment, {score: r.score, direction});
        }
    }

    /**
     * Return a new comment rendering context.
     */
    private makeCommentRenderingContext(): CommentRenderingContext {
        return {
            apiUrl:      this.apiService.basePath,
            root:        this.root,
            parentMap:   this.parentIdMap!,
            commenters:  this.commenters,
            principal:   this.principal,
            commentSort: this.commentSort,
            isReadonly:  this.pageInfo!.isDomainReadonly || this.pageInfo!.isPageReadonly,
            curTimeMs:   new Date().getTime(),
            onGetAvatar: user => this.createAvatarElement(user),
            onModerate:  (card, approve) => this.moderateComment(card, approve),
            onDelete:    card => this.deleteComment(card),
            onEdit:      card => this.editComment(card),
            onReply:     card => this.addComment(card),
            onSticky:    card => this.stickyComment(card),
            onVote:      (card, direction) => this.voteComment(card, direction),
        };
    }

    /**
     * Save current user's settings.
     */
    private async saveUserSettings(data: UserSettings) {
        // Run the update with the backend
        await this.apiService.authProfileUpdate(this.pageInfo!.pageId, data.notifyReplies, data.notifyModerator);

        // Refresh the auth status and update the profile bar
        await this.updateAuthStatus();

        // Reload all comments to reflect new commenter settings
        await this.reload();
    }

    /**
     * Make a clone of the original comment, replacing the provided properties, and replace that comment in parentIdMap
     * based on its ID.
     * NB: parentId should not change!
     * @param c Original comment.
     * @param props Property overrides for the new clone.
     */
    private replaceCommentById(c: Comment, props?: Partial<Comment>): Comment {
        // Make a clone of the comment, overriding any property in props
        const cc = {...c, ...props};

        // Replace the comment instance in the appropriate list in the parentIdMap
        const a = this.parentIdMap?.[c.parentId ?? ''];
        if (a) {
            const idx = a.findIndex(ci => ci.id === c.id);
            if (idx >= 0) {
                a[idx] = cc;
            }
        }
        return cc;
    }

    /**
     * Create and return a new element representing the avatar for the given user.
     * @param user User to create an avatar element for. If undefined, it means the user is deleted.
     */
    private createAvatarElement(user?: User): Wrap<any> {
        switch (true) {
            // If no user, it (probably) means the user was deleted
            case !user:
                return UIToolkit.div('avatar', 'bg-deleted');

            // If the user is anonymous
            case user!.id === ANONYMOUS_ID:
                return UIToolkit.div('avatar', 'bg-anonymous');

            // If the user has an image avatar, create a new image pointing to the API avatar endpoint
            case user!.hasAvatar:
                return Wrap.new('img')
                    .classes('avatar-img')
                    .attr({src: `${this.apiService.basePath}/users/${user!.id}/avatar?size=M`, loading: 'lazy', alt: ''});

            // The user has no avatar: render a circle containing their initial
            default:
                return UIToolkit.div('avatar', `bg-${user!.colourIndex}`).html(user!.name[0].toUpperCase());
        }
    }
}
