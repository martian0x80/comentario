import { Wrap } from './element-wrap';
import { UIToolkit } from './ui-toolkit';
import { Dialog, DialogPositioning } from './dialog';
import { LoginChoice, LoginData, LoginIdPId, PageInfo, TranslateFunc } from './models';

export class LoginDialog extends Dialog {

    private _email?: Wrap<HTMLInputElement>;
    private _pwd?: Wrap<HTMLInputElement>;
    private _userName?: Wrap<HTMLInputElement>;
    private _choice = LoginChoice.localAuth;
    private _idp?: LoginIdPId;

    private constructor(
        t: TranslateFunc,
        parent: Wrap<any>,
        pos: DialogPositioning,
        private readonly baseUrl: string,
        private readonly pageInfo: PageInfo,
    ) {
        super(t, parent, t('dlgTitleLogIn'), pos);
    }

    /**
     * Entered email.
     */
    get email(): string {
        return this._email?.val || '';
    }

    /**
     * Entered password.
     */
    get password(): string {
        return this._pwd?.val || '';
    }

    /**
     * Chosen/entered data.
     */
    get data(): LoginData {
        return {
            choice:   this._choice,
            idp:      this._idp,
            email:    this._email?.val,
            password: this._pwd?.val,
            userName: this._userName?.val,
        };
    }

    /**
     * Instantiate and show the dialog. Return a promise that resolves as soon as the dialog is closed.
     * @param t Function for obtaining translated messages.
     * @param parent Parent element for the dialog.
     * @param pos Positioning options.
     * @param baseUrl Base URL of the Comentario instance
     * @param pageInfo Current page data.
     */
    static run(t: TranslateFunc, parent: Wrap<any>, pos: DialogPositioning, baseUrl: string, pageInfo: PageInfo): Promise<LoginDialog> {
        const dlg = new LoginDialog(t, parent, pos, baseUrl, pageInfo);
        return dlg.run(dlg);
    }

    override renderContent(): Wrap<any> {
        const container = UIToolkit.div();
        let hasSections = false;

        // SSO auth
        if (this.pageInfo.authSso) {
            container.append(
                // Subtitle
                UIToolkit.div('dialog-centered')
                    .inner(`${this.t('loginViaSso')} ${this.pageInfo.ssoUrl?.replace(/^.+:\/\/([^/]+).*$/, '$1')}`),
                // SSO button
                UIToolkit.div('oauth-buttons')
                    .append(UIToolkit.button(this.t('actionSso'), () => this.dismissWith(LoginChoice.federatedAuth, 'sso'), 'btn-sso')));
            hasSections = true;
        }

        // Add OAuth buttons, if applicable
        if (this.pageInfo.idps?.length) {
            container.append(
                // Separator
                hasSections && Wrap.new('hr'),
                // Subtitle
                UIToolkit.div('dialog-centered').inner(this.t('loginViaSocial')),
                // OAuth buttons
                UIToolkit.div('oauth-buttons')
                    .append(
                        ...this.pageInfo.idps.map(idp =>
                            UIToolkit.button(idp.name, () => this.dismissWith(LoginChoice.federatedAuth, idp.id), `btn-${idp.id}`))));
            hasSections = true;
        }

        // If there's a local login option, create a login form
        if (this.pageInfo.authLocal) {
            // Create inputs
            this._email = UIToolkit.input('email',    'email',    this.t('fieldEmail'),    'email',            true).attr({maxlength: '254'});
            this._pwd   = UIToolkit.input('password', 'password', this.t('fieldPassword'), 'current-password', true).attr({maxlength: '63'});

            // Add a form with the inputs to the dialog
            UIToolkit.form(() => this.dismiss(true), () => this.dismiss())
                .id('login-form')
                .appendTo(container)
                .append(
                    // Separator
                    hasSections && Wrap.new('hr'),
                    // Subtitle
                    UIToolkit.div('dialog-centered').inner(this.t('loginViaLocalAuth')),
                    // Email
                    UIToolkit.div('input-group').append(this._email),
                    // Password
                    UIToolkit.div('input-group').append(this._pwd, UIToolkit.submit(this.t('actionLogIn'), true)),
                    // Forgot password link
                    UIToolkit.div('dialog-centered')
                        .append(
                            UIToolkit.a(this.t('forgotPasswordLink'), `${this.baseUrl}/en/auth/forgotPassword`)
                                .append(UIToolkit.icon('newTab').classes('ms-1'))));
            hasSections = true;
        }

        // Unregistered commenting
        if (this.pageInfo.authAnonymous) {
            // Put the input on another form to allow submission with Enter/Ctrl+Enter
            UIToolkit.form(() => this.dismissWith(LoginChoice.unregistered), () => this.dismiss())
                .id('unregistered-form')
                .appendTo(container)
                .append(
                    // Separator
                    hasSections && Wrap.new('hr'),
                    // Unregistered commenting text
                    UIToolkit.div('dialog-centered').inner(this.t('notWillingToLogin')),
                    // Commenter name
                    UIToolkit.div('input-group')
                        .append(
                            this._userName = UIToolkit.input('userName', 'text', this.t('fieldYourNameOptional'), 'name', false)
                                .attr({maxlength: '63'}),
                            UIToolkit.submit(this.t('actionCommentUnreg'), true)));
            hasSections = true;
        }

        // Signup
        if (this.pageInfo.localSignupEnabled) {
            container.append(
                // Separator
                hasSections && Wrap.new('hr'),
                // Signup text
                UIToolkit.div('dialog-centered')
                    .inner(this.t('noAccountYet'))
                    // Signup button
                    .append(UIToolkit.button(this.t('actionSignUpLink'), () => this.dismissWith(LoginChoice.signup), 'btn-secondary', 'ms-2')));
        }
        return container;
    }

    private dismissWith(choice: LoginChoice, idp?: LoginIdPId) {
        this._choice = choice;
        this._idp    = idp;
        this.dismiss(true);
    }
}
