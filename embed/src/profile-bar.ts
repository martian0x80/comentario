import { Wrap } from './element-wrap';
import { UIToolkit } from './ui-toolkit';
import { InstanceConfig, PageInfo, Principal, SignupData, UserSettings } from './models';
import { LoginDialog } from './login-dialog';
import { SignupDialog } from './signup-dialog';
import { SettingsDialog } from './settings-dialog';

export class ProfileBar extends Wrap<HTMLDivElement> {

    private btnSettings?: Wrap<HTMLAnchorElement>;
    private btnLogin?: Wrap<HTMLButtonElement>;
    private principal?: Principal;
    private _pageInfo?: PageInfo;

    /**
     * @param baseUrl Base URL of the Comentario instance
     * @param root Root element (for showing popups).
     * @param config Comentario configuration obtained from the backend.
     * @param onGetAvatar Callback for obtaining an element for the user's avatar.
     * @param onLocalAuth Callback for executing a local authentication.
     * @param onOAuth Callback for executing external (OAuth) authentication.
     * @param onSignup Callback for executing user registration.
     * @param onSaveSettings Callback for saving user settings.
     */
    constructor(
        private readonly baseUrl: string,
        private readonly root: Wrap<any>,
        private readonly config: InstanceConfig,
        private readonly onGetAvatar: () => Wrap<any> | undefined,
        private readonly onLocalAuth: (email: string, password: string) => Promise<void>,
        private readonly onOAuth: (idp: string) => Promise<void>,
        private readonly onSignup: (data: SignupData) => Promise<void>,
        private readonly onSaveSettings: (data: UserSettings) => Promise<void>,
    ) {
        super(UIToolkit.div('profile-bar').element);
    }

    /**
     * Current page data.
     */
    set pageInfo(v: PageInfo | undefined) {
        this._pageInfo = v;
        // Hide or show the login button based on the availability of any auth method
        this.btnLogin?.setClasses(!(v?.authLocal || (v?.authSso && !v.ssoNonInteractive) || v?.idps?.length), 'hidden');
    }

    /**
     * Called whenever there's an authenticated user. Sets up the controls related to the current user.
     * @param principal Currently authenticated user.
     * @param onLogout Logout button click handler.
     */
    authenticated(principal: Principal, onLogout: () => void): void {
        this.btnLogin = undefined;
        this.principal = principal;

        // Recreate the content
        this.html('')
            .append(
                // Commenter avatar and name
                UIToolkit.div('logged-in-as')
                    .append(
                        // Avatar
                        this.onGetAvatar(),
                        // Name and link
                        Wrap.new(this.principal.websiteUrl ? 'a' : 'div')
                            .classes('name')
                            .inner(this.principal.name!)
                            .attr({
                                href: this.principal.websiteUrl,
                                rel:  this.principal.websiteUrl && 'nofollow noopener noreferrer',
                            })),
                // Buttons on the right
                UIToolkit.div()
                    .append(
                        // Settings link
                        this.btnSettings = Wrap.new('a')
                            .classes('profile-link')
                            .inner('Settings')
                            .click((_, e) => {
                                // Prevent the page from being reloaded because of the empty href
                                e.preventDefault();
                                return this.editSettings();
                            }),
                        // Logout link
                        Wrap.new('a')
                            .classes('profile-link')
                            .inner('Logout')
                            .attr({href: ''})
                            .click((_, e) => {
                                // Prevent the page from being reloaded because of the empty href
                                e.preventDefault();
                                onLogout();
                            })));
    }

    /**
     * Called whenever there's no authenticated user. Sets up the login controls.
     */
    notAuthenticated(): void {
        // Remove all content
        this.html('')
            .append(
                // Add an empty div to push the button to the right (profile bar uses 'justify-content: space-between')
                UIToolkit.div(),
                // Add a Login button
                this.btnLogin = UIToolkit.button('Login', () => this.loginUser(), 'fw-bold'));
    }

    /**
     * Show a login dialog and return a promise that's resolved when the dialog is closed.
     */
    async loginUser(): Promise<void> {
        // If there's only one external auth method available, use it right away
        if (!this._pageInfo?.authLocal) {
            switch (this._pageInfo?.idps?.length || 0) {
                // If only SSO is enabled: trigger an SSO login
                case 0:
                    if (this._pageInfo?.authSso) {
                        return this.onOAuth('sso');
                    }
                    break;

                // A single federated IdP is enabled: turn to that IdP
                case 1:
                    return this.onOAuth(this._pageInfo!.idps![0].id);
            }
        }

        // Multiple options are available, show the login dialog
        const dlg = await LoginDialog.run(
            this.root,
            {ref: this.btnLogin!, placement: 'bottom-end'},
            this.baseUrl,
            this.config,
            this._pageInfo!);
        if (dlg.confirmed) {
            switch (dlg.navigateTo) {
                case null:
                    // Local auth
                    return this.onLocalAuth(dlg.email, dlg.password);

                case 'signup':
                    // Switch to signup
                    return this.signupUser();

                default:
                    // External auth
                    return this.onOAuth(dlg.navigateTo);
            }
        }
    }

    /**
     * Show a signup dialog and return a promise that's resolved when the dialog is closed.
     */
    async signupUser(): Promise<void> {
        const dlg = await SignupDialog.run(this.root, {ref: this.btnLogin!, placement: 'bottom-end'}, this.config);
        if (dlg.confirmed) {
            await this.onSignup(dlg.data);
        }
    }

    /**
     * Show the settings dialog and return a promise that's resolved when the dialog is closed.
     */
    async editSettings(): Promise<void> {
        const dlg = await SettingsDialog.run(
            this.root,
            {ref: this.btnSettings!, placement: 'bottom-end'},
            this.baseUrl,
            this.principal!,
            this._pageInfo!);
        if (dlg.confirmed) {
            await this.onSaveSettings(dlg.data);
        }
    }
}
