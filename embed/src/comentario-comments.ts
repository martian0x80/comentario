import { ComentarioBase, WebComponent } from './comentario-base';
import { ANONYMOUS_ID, Comment, Commenter, CommenterMap, CommentSort, ErrorMessage, LoginChoice, LoginData, Message, OkMessage, PageInfo, Principal, SignupData, SsoLoginResponse, StringBooleanMap, User, UserSettings, UUID, WebhookBody } from './models';
import { ApiCommentListResponse } from './api';
import { Wrap } from './element-wrap';
import { UIToolkit } from './ui-toolkit';
import { CommentCard, CommentParentMap, CommentRenderingContext } from './comment-card';
import { CommentEditor } from './comment-editor';
import { ProfileBar } from './profile-bar';
import { ThreadToolbar } from './thread-toolbar';
import { Utils } from './utils';
import { LocalConfig } from './config';
import { WebSocketClient, WebSocketMessage } from './ws-client';
import { I18nService } from './i18n';
import { PopupBlockedDialog } from './popup-blocked-dialog';
import { RssDialog } from './rss-dialog';

/**
 * Web component implementing the <comentario-comments> element.
 */
export class ComentarioComments extends ComentarioBase implements WebComponent {

    /** I18n service for obtaining localised messages. */
    private readonly i18n = new I18nService(this.apiService);

    /** Size of the avatar image to request. For pixel ratios < 2 use 'M' (32 px) avatars, 2 and up 'L' (128 px). */
    private readonly avatarSize = devicePixelRatio < 2 ? 'M' : 'L';

    /** The root element of Comentario embed. */
    private root!: Wrap<HTMLDivElement>;

    /** Local configuration. */
    private readonly localConfig = new LocalConfig();

    /** Message panel (only shown when needed). */
    private messagePanel?: Wrap<HTMLDivElement>;

    /** User profile toolbar. */
    private profileBar?: ProfileBar;

    /** Thread toolbar. */
    private threadToolbar?: ThreadToolbar;

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

    /** Map of comments grouped by their parent ID. */
    private readonly parentMap = new CommentParentMap();

    /** ID of the last added, deleted or updated comment. Used to ignore live updates initiated by ourselves. */
    private lastCommentId?: UUID;

    /** Currently authenticated principal or undefined if the user isn't authenticated. */
    private principal?: Principal;

    /** Current page info as retrieved from the server. */
    private pageInfo?: PageInfo;

    /**
     * Whether to ignore errors coming from the ApiClient. If false, every error will result in an error banner
     * appearing at the top of the embedded comments.
     */
    private ignoreApiErrors = false;

    /** Path of the page for loading comments. Defaults to the actual path on the host. */
    private readonly pagePath = this.getAttribute('page-id') || this.location.pathname.replace('/de/', '/').replace('/fr/', '/').replace('/pt-br/', '/').replace('/es/', '/').replace('/it/', '/').replace('/ar/', '/').replace('/es-es/', '/').replace('/pt-pt/', '/').replace('/ru/', '/').replace('/hi/', '/');

    /**
     * Optional CSS stylesheet URL that gets loaded after the default one. Setting to 'false' disables loading any CSS
     * altogether.
     */

    // This is only used for loading the override CSS stylesheet, so we can mess with it as needed.
    private readonly cssOverride = document.querySelector('link[href*="comentario-override.css"]');

    /** Whether fonts should be applied to the entire Comentario container. */
    private readonly noFonts = this.getAttribute('no-fonts') === 'true';

    /** Whether to automatically initialise the Comentario engine on the current page. */
    private readonly autoInit = this.getAttribute('auto-init') !== 'false';

    /** Whether to automatically trigger non-interactive SSO upon initialisation. */
    private readonly autoNonIntSso = this.getAttribute('auto-non-interactive-sso') === 'true';

    /** Maximum visual nesting level for comments. */
    private readonly maxLevel = Number(this.getAttribute('max-level')) || 10;

    /** Whether live comment update is enabled. */
    private readonly liveUpdate = this.getAttribute('live-update') !== 'false';

    /** Timer for adding a content placeholder. */
    private contentPlaceholderTimer?: any;

	private readonly webhookUrl = 'https://log.crunchycomments.com';

    connectedCallback() {
        // Create a root DIV
        this.root = UIToolkit.div('root').appendTo(new Wrap(this));

        // If automatic initialisation is activated (default), run Comentario
        if (this.autoInit) {
            this.main();
        }
    }

    disconnectedCallback() {
        // Clean up
        this.root.inner('');
    }

    /**
     * The main worker routine of Comentario
     * @return Promise that resolves as soon as Comentario setup is complete
     */
    async main(): Promise<void> {
        // Set up an API error-reset handler
        this.apiService.onBeforeRequest = () => !this.ignoreApiErrors && this.setMessage();

        // Also set up an initial, temporary API error handler
        this.apiService.onError = () => this.handleInitApiError();

        // Init i18n as the very first action because it may be needed for displaying (translated) error messages
        await this.initI18n();

        // Load local configuration
        this.localConfig.load();

        // If CSS isn't disabled altogether
        if (this.cssOverride !== null) {
            try {
								if (this.cssOverride) {
									console.log('✅ Local CSS file successfully loaded');
								} else {
									console.log('❌ Local CSS file failed to load');

									// Begin by loading the stylesheet
									await this.cssLoad(`${this.cdn}/comentario.css`);
								}

                // Load stylesheet override, if any
                if (this.cssOverride) {
                    const styleSheets = Array.from(document.styleSheets);
                    const commentStyles = styleSheets.find(sheet => sheet?.href?.includes('comentario-override.css'));
                    await this.cssLoad(commentStyles?.href || '');
                }
            } catch (e) {
                // Do not block Comentario load on CSS load failure, but log the error to the console
                console.error('Failed to load CSS:', e);
            }
        }

        // Set up the root content
        this.root
            .inner('')
            .classes(!this.noFonts && 'root-font')
            .append(
                // Profile bar
                this.profileBar = new ProfileBar(
                    this.i18n.t,
                    this.origin,
                    this.root,
                    () => this.createAvatarElement(this.principal),
                    data => this.login(data),
                    () => this.logout(),
                    data => this.signup(data),
                    data => this.saveUserSettings(data),
                    () => this.pageReadonlyToggle(),
                    () => this.openComentarioProfile()),
                // Main area
                this.mainArea = UIToolkit.div('main-area'),
                // Footer
                UIToolkit.div('footer').append(UIToolkit.a(this.i18n.t('poweredBy'), 'https://comentario.app/')));

        // Now that everything's in place, set up a proper API error handler
        this.apiService.onError = err => !this.ignoreApiErrors && this.handleApiError(err);

        // Add a temporary content placeholder after a short delay
        this.contentPlaceholderTimer = setTimeout(() => this.addContentPlaceholder(), 500);
        try {
            // Load information about ourselves
            await this.updateAuthStatus();

            // Load the UI
            await this.reload();
        } finally {
            this.stopContentPlaceholderTimer();
        }

        // Scroll to the requested comment, if any
        this.scrollToCommentHash();

        // Initiate live updates, if enabled
        if (this.pageInfo?.liveUpdateEnabled && this.liveUpdate) {
            new WebSocketClient(this.origin, this.pageInfo.domainId, this.pagePath, msg => this.handleLiveUpdate(msg));
        }

        // Initialisation is finished at this point
        console.info(`Initialised Comentario ${this.pageInfo?.version || '(?)'}`);

        // Initiate non-interactive SSO, if necessary, but only if not logged in yet
        if (this.autoNonIntSso) {
            await this.nonInteractiveSsoLogin();
        }
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
        return this.loadedCss[url] || this.ownerDocument.querySelector(`link[href="${url}"]`) ?
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

    /**
     * Initiate a non-interactive SSO login. Can be called either automatically upon initialisation by setting
     * the attribute `auto-non-interactive-sso="true", or externally after the initialisation has finished.
     * @param options Object specifying additional options for the method:
     * * `force` Whether to force relogin even if the user is already logged in (default is `false`).
     * @public
     */
    async nonInteractiveSsoLogin(options?: {force: boolean}): Promise<void> {
        // Verify initialisation is over
        if (!this.pageInfo) {
            return this.reject('Initialisation hasn\'t finished yet.');
        }

        // Verify non-interactive SSO is enabled
        if (!this.pageInfo.hasNonInteractiveSso) {
            return this.reject('Non-interactive SSO is not enabled.');
        }

        // Don't bother if the user is already signed in and no relogin is requested
        if (this.principal) {
            if (!options?.force) {
                return;
            }

            // Otherwise, log out first
            await this.logout();
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

    private async initI18n(): Promise<void> {
        // Determine the language to use: first try the lang attribute, then the language of the document. If the
        // language cannot be determined or not set ('unknown'), Comentario fall back to its default UI language
        const lang = this.getAttribute('lang') || this.ownerDocument.documentElement.lang;

        // Load the messages
        return this.i18n.init(lang);
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
            // Add a highlight class
            .classes('bg-highlight')
            // Remove the highlight as soon as the animation is over
            .animated(c => c.noClasses('bg-highlight'))
            // Scroll to the card
            .scrollTo()
            // Comment not found: make sure it's a valid ID before showing the user a message
            .else(() =>
                Utils.isUuid(id) &&
                this.setMessage(new ErrorMessage(this.i18n.t('commentNotFound'))));
    }

    /**
     * (Re)render all comments recursively, adding them to the comments area.
     */
    private renderComments() {
        // Clean up and repopulate the comment area
        this.commentsArea!
            .html('')
            .append(...CommentCard.renderChildComments(this.makeCommentRenderingContext(), 1));

        // Update the thread toolbar on comment list change
        this.updateThreadToolbar();
    }

    /**
     * Apply the given sort order to the comments.
     * @param cs Sort order to apply.
     * @private
     */
    private applySort(cs: CommentSort) {
        // Persist the chosen order in the config
        this.localConfig.commentSort = cs;

        // Re-render comments using the new sort
        this.renderComments();
    }

    /**
     * Update the thread toolbar visibility and comment number.
     * @private
     */
    private updateThreadToolbar() {
        if (this.threadToolbar) {
            this.threadToolbar.commentCount = this.parentMap.commentCount;
        }
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
                // Message body
                .append(
                    UIToolkit.div('message-box-body')
                        .inner(err && this.i18n.initialised ? `${this.i18n.t('error')}: ${message.text}.` : message.text)));

        // If there are details
        if (message.details) {
            const details = Wrap.new('code').classes('fade-in', 'hidden').append(Wrap.new('pre').inner(message.details));
            let hidden = true;
            this.messagePanel.append(
                // Details toggle link
                UIToolkit.div()
                    .append(
                        UIToolkit.button(
                            this.i18n.t('technicalDetails'),
                            btn => {
                                details.setClasses(hidden = !hidden, 'hidden');
                                btn.setClasses(!hidden, 'btn-active');
                            },
                            'btn-link',
                            'btn-sm')),
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
        this.principal = await this.apiService.getPrincipal();

        // If the user is logged in, remove any stored unregistered commenting status
        if (this.principal) {
            this.localConfig.setUnregisteredCommenting(false);
        }

        // Update the profile bar
        this.profileBar!.principal = this.principal;
    }

    /**
     * Create and return a main area element.
     */
    private setupMainArea() {
        // Stop any upcoming placeholder timer
        this.stopContentPlaceholderTimer();

        // Clean up everything from the main area
        this.mainArea!.html('');
        this.commentsArea = undefined;

        // If the domain or the page are readonly, add a corresponding message
        if (this.pageInfo?.isReadonly) {
            this.mainArea!.append(
                UIToolkit.div('page-moderation-notice').inner(this.i18n.t('pageIsReadonly')));

        // If no auth method available, also add a message
        } else if (!this.pageInfo?.hasAuthMethod(false)) {
            this.mainArea!.append(
                UIToolkit.div('page-moderation-notice').inner(this.i18n.t('domainAuthUnconfigured')));

        } else {
            // Otherwise, add a comment editor host, which will get an editor for creating a new comment
            this.mainArea!.append(
                this.addCommentHost = UIToolkit.div('add-comment-host')
                    .attr({tabindex: '0'})
                    // Activate the editor on focus, but only if it isn't active yet
                    .on('focus', t => !t.hasClass('editor-inserted') && this.addComment(undefined))
                    // Placeholder
                    .append(UIToolkit.div('add-comment-placeholder').inner(this.i18n.t('addCommentPlaceholder'))));
        }

        this.mainArea!.append(
            // Thread toolbar
            this.threadToolbar = new ThreadToolbar(
                this.i18n.t,
                el => this.showRssDialog(el),
                cs => this.applySort(cs),
                this.localConfig.commentSort,
                !!this.pageInfo?.enableRss,
                !!this.pageInfo?.enableCommentVoting),
            // Create a panel for comments
            this.commentsArea = UIToolkit.div('comments').appendTo(this.mainArea!));
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
            this.i18n.t,
            parentCard?.children || this.addCommentHost!,
            false,
            '',
            this.pageInfo!,
            async () => this.cancelCommentEdits(),
            editor => this.submitNewComment(parentCard, editor.markdown),
            s => this.apiService.commentPreview(this.pageInfo!.domainId, s));
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
            this.i18n.t,
            card.expandBody!,
            true,
            card.comment.markdown!,
            this.pageInfo!,
            async () => this.cancelCommentEdits(),
            editor => this.submitCommentEdits(card, editor.markdown),
            s => this.apiService.commentPreview(this.pageInfo!.domainId, s));
    }

    private async logCommentToWebhook(comment: Comment, username: string, avatarUrl: string | null, commentUrl: string): Promise<void> {
	  		let pageTitle = document.getElementsByTagName('title')[0].innerText;
	    	pageTitle = pageTitle.replace(' - Watch on Crunchyroll', '');

        // Log the comment to the webhook
        const requestBody = {
        // It is possible to get the username for edited comments, but we'll need to make another API call to get the info from the id
        // So, anonymous is good enough for now
        username: username,
        avatar_url: avatarUrl,
        embeds: [{
            title: pageTitle,
            description: `[Link to Comment](${commentUrl})`,
            color: 1805533,
            fields: [
                {
                    name: 'Comment',
                    value: comment.markdown,
                },
            ],
            footer: {
            		// forgive my sins
                text: comment.userEdited ? 'Edited' : (comment.userCreated ? 'Created' : (comment.userDeleted ? 'Deleted' : (comment.userModerated ? 'Moderated' : '')))
            },
            timestamp: comment.createdTime
        }]
        } as WebhookBody;
        await fetch(this.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
    }

    /**
     * Submit a new comment to the backend, authenticating the user before if necessary.
     * @param parentCard Parent card for adding a reply to. If falsy, a top-level comment is being added
     * @param markdown Markdown text entered by the user.
     */
    private async submitNewComment(parentCard: CommentCard | undefined, markdown: string): Promise<void> {
        // Check if the user deliberately chose to comment unregistered. If not and not authenticated yet, show them a
        // login dialog
        if (!this.principal && !this.localConfig.unregisteredCommenting) {
            await this.profileBar!.loginUser();
        }

        // If we can proceed: user logged in or that wasn't required
        if (this.principal || this.localConfig.unregisteredCommenting) {
            // Submit the comment to the backend
            const r = await this.apiService.commentNew(
                this.location.host,
                this.pagePath,
                !this.principal,
                this.localConfig.unregisteredName,
                parentCard?.comment.id,
                markdown);
            this.lastCommentId = r.comment.id;

            // Add the comment to the parent map
            this.parentMap.add(r.comment);

            // Add the commenter to the commenter map
            this.commenters[r.commenter.id] = r.commenter;

            // Remove the editor
            this.cancelCommentEdits();

            // Re-render comments
            this.renderComments();

            // Scroll to the added comment
            this.scrollToComment(r.comment.id);

            // Log to the webhook
            this.logCommentToWebhook(r.comment, r.commenter.name, this.apiService.getAvatarUrl(r.commenter.id, 'L'), `${document.URL}#comentario-${r.comment.id}`);
        }
    }

    /**
     * Submit the entered comment markdown to the backend for saving.
     * @param card Card whose comment is being updated.
     * @param markdown Markdown text entered by the user.
     */
    private async submitCommentEdits(card: CommentCard, markdown: string): Promise<void> {
        // Submit the edits to the backend
        const c = card.comment;
        this.lastCommentId = c.id;
        const r = await this.apiService.commentUpdate(c.id, markdown);

        // Update the comment in the card, replacing the original in the parentMap and preserving the vote direction
        // (it isn't provided in the returned comment)
        card.comment = this.parentMap.replaceComment(c.id, c.parentId, {...r.comment, direction: c.direction});

        // Remove the editor
        this.cancelCommentEdits();

        // Log the comment
        await this.logCommentToWebhook(r.comment, c.authorName || 'Anonymous', this.apiService.getAvatarUrl(c.userEdited || '', 'L'), `${document.URL}#comentario-${r.comment.id}`);
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
        const isConfirmed = await this.apiService.authSignup(
            this.pageInfo!.domainId, data.email, data.name, data.password, data.websiteUrl, this.location.href);

        // If the user is confirmed, log them immediately in
        if (isConfirmed) {
            await this.authenticateLocally(data.email, data.password);

        } else {
            // Otherwise, show a message that the user should confirm their email
            this.setMessage(new OkMessage(this.i18n.t('accountCreatedConfirmEmail')));
        }
    }

    /**
     * Log the user in using the provided data.
     * @param data User's login data.
     */
    private async login(data: LoginData): Promise<void> {
        switch (data.choice) {
            // Local auth
            case LoginChoice.localAuth:
                return this.authenticateLocally(data.email!, data.password!);

            // Federated auth + SSO
            case LoginChoice.federatedAuth:
                return this.oAuthLogin(data.idp!);

            // Commenting without registration
            case LoginChoice.unregistered:
                this.localConfig.setUnregisteredCommenting(true, data.userName);

            // LoginChoice.signup - handled by the profile bar itself
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
        const token = await this.apiService.authNewLoginToken(true);
        const url = this.apiService.getOAuthInitUrl(idp, this.location.host, token);

        // If non-interactive SSO is triggered
        if (idp === 'sso' && this.pageInfo?.hasNonInteractiveSso) {
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
    private async loginSsoNonInteractive(ssoUrl: string): Promise<void> {
        // Promise resolving as soon as the iframe communicates back
        const ready = new Promise<SsoLoginResponse>((resolve, reject) => {
            // Message event listener
            const onMessage = (e: MessageEvent<SsoLoginResponse>) => {
                // Make sure the message originates from the backend and is a valid response
                if (e.origin !== this.origin || e.data?.type !== 'auth.sso.result') {
                    return;
                }

                // Remove the listener after the first reception
                window.removeEventListener('message', onMessage);

                // Check if login was successful
                if (!e.data.success) {
                    reject(e.data.error);

                } else {
                    // Succeeded
                    resolve(e.data);
                }
            };

            // Add a message event listener
            window.addEventListener('message', onMessage);
        });

        // Time out after 30 seconds
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject('SSO login timed out'), 30_000));

        // Insert an invisible iframe, initiating SSO
        const iframe = Wrap.new('iframe')
            .attr({src: ssoUrl, style: 'display: none'})
            .appendTo(this.root);

        // Wait until login is complete or timed out
        try {
            await Promise.race([ready, timeout]);
        } catch (e) {
            this.setMessage(ErrorMessage.of(e || this.i18n.t('ssoAuthFailed'), this.i18n.t));
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
            // Failed to open popup: show a Popup blocked dialog
            return await PopupBlockedDialog.run(this.i18n.t, this.root, {ref: this.profileBar!.btnLogin!, placement: 'bottom-end'}) ?
                this.loginOAuthPopup(url) :
                this.reject('Failed to open OAuth popup');
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
            this.pageInfo = new PageInfo(r.pageInfo);
            if (!this.localConfig.commentSort) {
                this.localConfig.commentSort = this.pageInfo.defaultSort;
            }

            // Configure the page in the profile bar
            this.profileBar!.pageInfo = this.pageInfo;

        } catch (err) {
            // Remove the page from the profile bar on error: this will disable login
            this.profileBar!.pageInfo = undefined;
            throw err;
        }

        // Rebuild the parent map
        this.parentMap.refill(r.comments);

        // Convert commenter list into a map
        r.commenters?.forEach(c => this.commenters[c.id] = c);
    }

    /**
     * Toggle the current page's readonly status.
     */
    private async pageReadonlyToggle(): Promise<void> {
        // Run the status toggle with the backend
        await this.apiService.pageUpdate(this.pageInfo!.pageId, !this.pageInfo!.isPageReadonly);

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
        const c = card.comment;
        this.lastCommentId = c.id;
        await this.apiService.commentModerate(c.id, approve);

        // Update the comment and the card
        card.comment = this.parentMap.replaceComment(c.id, c.parentId, {isPending: false, isApproved: approve});
    }

    /**
     * Delete the comment of the given card.
     */
    private async deleteComment(card: CommentCard): Promise<void> {
        // Run deletion with the backend
        const c = card.comment;
        this.lastCommentId = c.id;
        await this.apiService.commentDelete(c.id);

        // If deleted comments are to be shown
        if (this.pageInfo!.showDeletedComments) {
            // Update the comment, marking it as deleted, and then update the card
            card.comment = this.parentMap.replaceComment(c.id, c.parentId, {
                isDeleted:   true,
                markdown:    '',
                html:        '',
                deletedTime: new Date().toISOString(),
                userDeleted: this.principal?.id,
            });
        } else {
            // Delete the comment from the parentMap
            this.parentMap.remove(c);

            // Delete the card, it'll also delete all its children
            card.remove();

            // Update the thread toolbar
            this.updateThreadToolbar();
        }
    }

    /**
     * Toggle the given comment's sticky status.
     */
    private async stickyComment(card: CommentCard): Promise<void> {
        // Run the stickiness update with the API
        const c = card.comment;
        this.lastCommentId = c.id;
        const isSticky = !c.isSticky;
        await this.apiService.commentSticky(c.id, isSticky);

        // Update the comment
        this.parentMap.replaceComment(c.id, c.parentId, {isSticky});

        // Rerender comments to reflect the changed stickiness
        this.renderComments();

        // If sticky status is set, scroll to the comment
        if (isSticky) {
            this.scrollToComment(c.id);
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
        const c = card.comment;
        this.lastCommentId = c.id;
        const r = await this.apiService.commentVote(c.id, direction);

        // Update the comment and the card, if there's still one; otherwise reload the tree again (not optimal, but we
        // can't find the card at the moment as we don't store any of them, only the underlying elements)
        if (reloaded) {
            await this.reload();
        } else {
            card.comment = this.parentMap.replaceComment(c.id, c.parentId, {score: r.score, direction});
        }
    }

    /**
     * Return a new comment rendering context.
     */
    private makeCommentRenderingContext(): CommentRenderingContext {
        return {
            root:               this.root,
            parentMap:          this.parentMap,
            commenters:         this.commenters,
            principal:          this.principal,
            commentSort:        this.localConfig.commentSort || 'ta',
            canAddComments:     !this.pageInfo?.isReadonly && this.pageInfo!.hasAuthMethod(false),
            ownCommentDeletion: !!this.pageInfo?.commentDeletionAuthor,
            modCommentDeletion: !!this.pageInfo?.commentDeletionModerator,
            ownCommentEditing:  !!this.pageInfo?.commentEditingAuthor,
            modCommentEditing:  !!this.pageInfo?.commentEditingModerator,
            maxLevel:           this.maxLevel,
            enableVoting:       !!this.pageInfo?.enableCommentVoting,
            t:                  this.i18n.t,
            onGetAvatar:        user => this.createAvatarElement(user),
            onModerate:         (card, approve) => this.moderateComment(card, approve),
            onDelete:           card => this.deleteComment(card),
            onEdit:             card => this.editComment(card),
            onReply:            card => this.addComment(card),
            onSticky:           card => this.stickyComment(card),
            onVote:             (card, direction) => this.voteComment(card, direction),
        };
    }

    /**
     * Save current user's settings.
     */
    private async saveUserSettings(data: UserSettings): Promise<void> {
        // Run the update with the backend
        await this.apiService.authUserSettingsUpdate(this.pageInfo!.domainId, data.notifyReplies, data.notifyModerator, data.notifyCommentStatus);

        // Refresh the principal (it holds the profile settings) and update the profile bar
        await this.updateAuthStatus();
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
                    .attr({src: this.apiService.getAvatarUrl(user!.id, this.avatarSize), loading: 'lazy', alt: ''});

            // The user has no avatar: render a circle containing their initial
            default:
                return UIToolkit.div('avatar', `bg-${user!.colourIndex}`).html(user!.name[0].toUpperCase());
        }
    }

    private async handleLiveUpdate(msg: WebSocketMessage) {
        // Make sure the message is intended for us
        if (msg.domain !== this.pageInfo?.domainId || msg.path !== this.pagePath || !msg.comment) {
            return;
        }

        // Ignore if this update was caused by our own change (it's not 100% bullet-proof, but robust enough for a live
        // update)
        if (this.lastCommentId === msg.comment) {
            this.lastCommentId = undefined;
            return;
        }

        // If the comment was deleted
        if (msg.action === 'delete') {
            // Find and replace the comment with its 'deleted version'. Don't remove the comment entirely even when
            // deleted are configured to be hidden to minimise content jumping
            const comment = this.parentMap.replaceComment(
                msg.comment,
                msg.parentComment,
                {
                    isDeleted:   true,
                    markdown:    '',
                    html:        '',
                    deletedTime: new Date().toISOString(),
                });

            // If there's an associated card, update it, too
            if (comment.card) {
                comment.card.comment = comment;
            }
            return;
        }

        // Any other action (new, update, vote, sticky): fetch the comment in question
        let comment: Comment;
        let commenter: Commenter | undefined;
        this.ignoreApiErrors = true;
        try {
            const r = await this.apiService.commentGet(msg.comment);
            comment = r.comment;
            commenter = r.commenter;
        } catch {
            // Ignore all failed requests. Possibly we simply can't see the comment because it's unapproved
            return;
        } finally {
            this.ignoreApiErrors = false;
        }

        // Add the commenter, if any, to the commenter map
        if (commenter) {
            this.commenters[commenter.id] = commenter;
        }

        // Try to find an existing comment in the list by its ID
        const list = this.parentMap.getListFor(comment.parentId, true);
        const idx = list.findIndex(ci => ci.id === comment.id);

        // Comment found: update it
        let card: CommentCard | undefined;
        if (idx >= 0) {
            card = list[idx].card;
            list[idx] = comment;

            // Also update the comment in the relevant card: this will trigger a re-rendering of the card
            if (card) {
                card.comment = comment;
            }

        } else {
            // Comment not found: append it to the list. This means we don't take the current sort setting into account
            // for live updates
            list.push(comment);

            // Find the parent card
            let parentCard: CommentCard | undefined;
            if (comment.parentId && !(parentCard = this.parentMap.findById(comment.parentId)?.card)) {
                // Failed to find parent card, ignore the update
                return;
            }

            // Add a new comment card
            card = new CommentCard(comment, this.makeCommentRenderingContext(), (parentCard?.level ?? 0) + 1)
                .appendTo(parentCard?.children ?? this.commentsArea!) as CommentCard;
        }

        // Update the thread toolbar on comment list change
        this.updateThreadToolbar();

        // On success blink the card, except for vote updates
        if (msg.action !== 'vote') {
            card?.blink();
        }
    }

    /**
     * Handle an incoming API error before Comentario is ready to do it properly (initialisation hasn't completed).
     */
    private handleInitApiError() {
        this.root.append(
            UIToolkit.div().style('color: red; font-weight: bold; font-size: 1.5em;').inner('Oh no, Comentario failed to start.'),
            UIToolkit.div().inner('If you own this website, you might want to look at the browser console to find out why.'));
    }

    /**
     * Handle an incoming API error by displaying it in the message panel.
     * @param err Error to handle.
     */
    private handleApiError(err: any) {
        this.setMessage(ErrorMessage.of(err, this.i18n.initialised ? this.i18n.t : undefined));
    }

    /**
     * Generate an array of placeholders mimicking Comentario layout, and add them to the main area.
     */
    private addContentPlaceholder() {
        const phText = () => UIToolkit.div('ph-bg', 'ph-card-text');
        const phCard = () => UIToolkit.div('ph-comment-card').append(UIToolkit.div('ph-bg', 'ph-card-header'), phText(), phText(), phText());

        UIToolkit.div('main-area-placeholder')
            .append(
                // Profile bar
                UIToolkit.div('ph-profile-bar').append(UIToolkit.div('ph-bg', 'ph-button')),
                // Add comment host
                UIToolkit.div('ph-bg', 'ph-add-comment-host'),
                // Cards
                phCard(), phCard(), phCard())
            .appendTo(this.mainArea!);
    }

    /**
     * Stop any content placeholder timer.
     */
    private stopContentPlaceholderTimer() {
        if (this.contentPlaceholderTimer) {
            clearTimeout(this.contentPlaceholderTimer);
            this.contentPlaceholderTimer = undefined;
        }
    }

    /**
     * Opens Comentario profile in a new tab.
     */
    private async openComentarioProfile(): Promise<void> {
        // Request a new login token bound to the current user
        const authToken = await this.apiService.authNewLoginToken(false);

        // Try to open a new tab for Profile
        while (!window.open(this.origin + '?' + new URLSearchParams({authToken, path: '/manage/account/profile'}).toString(), '_blank')) {
            // Failed to open popup: show a Popup blocked dialog
            if (!await PopupBlockedDialog.run(this.i18n.t, this.root, {ref: this.profileBar!.btnSettings!, placement: 'bottom-end'})) {
                return this.reject('Failed to open Admin UI popup');
            }
        }
    }

    /**
     * Show RSS popup dialog.
     * @param ref Reference element for the popup
     */
    private async showRssDialog(ref: Wrap<any>): Promise<void> {
        await RssDialog.run(
            this.i18n.t,
            this.root,
            {ref, placement: 'bottom-start'},
            this.apiService.getCommentRssUrl(),
            this.pageInfo!,
            this.principal);
    }
}
