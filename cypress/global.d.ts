declare namespace Cypress {

    interface Credentials {
        email:    string;
        password: string;
    }

    interface User extends Credentials {
        isAnonymous: boolean;
        id:          string;
        name:        string;
        isBanned?:   boolean;
    }

    interface Domain {
        id:    string;
        host:  string;
        name?: string;
    }

    interface SentMail {
        headers:    { [k: string]: string };
        embedFiles: string[];
        body:       string;
        succeeded:  boolean;
    }

    /** Rendered comment. */
    interface Comment {
        id:        string;
        html:      string;
        author:    string;
        score:     number;
        upvoted:   boolean;
        downvoted: boolean;
        sticky:    boolean;
        pending:   boolean;
        children?: Comment[];
    }

    interface LoginOptions {
        /** Whether to go to the login page before trying to login. Defaults to true. */
        goTo?: boolean;
        /** Whether login must succeed. Defaults to true. */
        succeeds?: boolean;
        /** Path the user is redirected to after login. Only when succeeds is true. Defaults to the Dashboard path. */
        redirectPath?: string | RegExp | IsAtObjectWithUnderscore;
        /** Error toast shown after login fails. Mandatory is succeeds is false, otherwise ignored. */
        errToast?: string;
    }

    interface IsAtObjectWithUnderscore {
        _: string | RegExp;
    }

    interface Chainable {

        /**
         * Assert the current URL corresponds to the given relative path.
         * @param expected Literal path or a regex to match the current path against
         * @param options Additional options
         */
        isAt(expected: string | RegExp | IsAtObjectWithUnderscore, options?: {ignoreQuery?: boolean}): Chainable<string>;

        /**
         * Assert the user is authenticated (or not).
         * @param loggedIn If true (the default), the user must be logged in, otherwise they must be logged out.
         */
        isLoggedIn(loggedIn?: boolean): Chainable<void>;

        /**
         * Collect page comments and return them as a tree structure. Can be chained off an element containing the
         * desired Comentario instance, if no subject is provided, looks for the first <comentario-comments> tag.
         * @param properties Properties to keep for each comment. If not provided, keeps all properties.
         */
        commentTree(...properties: (keyof Comment)[]): Chainable<Partial<Comment>[]>;

        /**
         * Set an input's value directly.
         */
        setValue(s: string): Chainable<JQueryWithSelector>;

        /**
         * Collect visible texts of all child elements or all elements matching the selector and return them as a string
         * array. Must either be used as a child command, or be given a selector (or both).
         */
        texts(selector?: string): Chainable<string[]>;

        /**
         * Verify the passed element has no invalid feedback.
         */
        isValid(): Chainable<JQueryWithSelector>;

        /**
         * Verify the passed element has the .is-invalid class, invalid feedback, and, optionally, its text.
         */
        isInvalid(text?: string): Chainable<JQueryWithSelector>;

        /**
         * Signup as provided user via the UI.
         * @param user User to login as
         * @param options Additional options, default to {goTo: true}
         */
        signup(user: Credentials & {name: string}, options?: {goTo?: boolean}): Chainable<void>;

        /**
         * Login as provided user via the UI.
         * @param creds Credentials to login with
         * @param options Additional login options
         */
        login(creds: Credentials, options?: LoginOptions): Chainable<void>;

        /**
         * Log the currently authenticated user out via the UI.
         * NB: the sidebar must be visible.
         */
        logout(): Chainable<void>;

        /**
         * Login as provided user directly, via an API call.
         * @param creds Credentials to login with
         * @param targetUrl URL to go to after the login.
         */
        loginViaApi(creds: Credentials, targetUrl: string): Chainable<void>;

        /**
         * Verify there is no toast.
         */
        noToast(): Chainable<Element>;

        /**
         * Verify the topmost toast has the given ID, and, optionally, details text, then close it with the Close button.
         */
        toastCheckAndClose(id: string, details?: string): Chainable<Element>;

        /**
         * Click the label associated with the given element (based on the label's "for" attribute).
         */
        clickLabel(position?: PositionType): Chainable<JQueryWithSelector>;

        /**
         * Click a sidebar item with the given label and verify the resulting path.
         * @param itemLabel Label of the sidebar item to click.
         * @param isAt Path to verify.
         */
        sidebarClick(itemLabel: string, isAt: string | RegExp): Chainable<void>;

        /**
         * Select a domain using the Domains page.
         * NB: the sidebar must be visible.
         * @param domain Domain to select.
         */
        selectDomain(domain: Domain): Chainable<void>;

        /**
         * Return the currently open confirmation dialog.
         * @param text Optional text the dialog has to contain.
         */
        confirmationDialog(text?: string | RegExp): Chainable<JQueryWithSelector>;

        /**
         * Click a confirmation dialog button having the given label. Must be chained off a dialog returned with
         * confirmationDialog().
         * @param text Button text.
         */
        dlgButtonClick(text: string): Chainable<JQueryWithSelector>;

        /**
         * Cancel the confirmation dialog. Must be chained off a dialog returned with confirmationDialog().
         */
        dlgCancel(): Chainable<JQueryWithSelector>;

        /**
         * Click a sort dropdown and then a sort button with the given label.
         * @param label Sort button label to click.
         * @param expectOrder The expected sort order after the click.
         */
        changeListSort(label: string, expectOrder: 'asc' | 'desc'): Chainable<void>;

        /**
         * Verify that when visiting the given path, the application first redirects to the login page and subsequently
         * back to that path.
         * @param path Path to verify.
         * @param user User to login as.
         */
        verifyRedirectsAfterLogin(path: string, user: User): Chainable<void>;

        /**
         * Verify the application stays on the provided page after a reload.
         * @param path Path to verify.
         * @param user Optional user to login as.
         */
        verifyStayOnReload(path: string, user?: User): Chainable<void>;

        /**
         * Verify text in the list footer. Can be chained off an element containing the footer.
         * @param count Expected number of items reported in the footer.
         * @param more Whether there are more items that can be loaded.
         * @param noDataText Optional (partial) custom text to expect if there's no data.
         * @return The footer element.
         */
        verifyListFooter(count: number, more: boolean, noDataText?: string): Chainable<JQueryWithSelector>;

        /**
         * Run common email input validations against the passed element.
         * NB: the input must be touched.
         */
        verifyEmailInputValidation(): Chainable<JQueryWithSelector>;

        /**
         * Run common password input validations against the passed element.
         * NB: the input must be touched.
         */
        verifyPasswordInputValidation(options?: {required?: boolean, strong?: boolean}): Chainable<JQueryWithSelector>;

        /**
         * Run common user name input validations against the passed element.
         * NB: the input must be touched.
         */
        verifyUserNameInputValidation(): Chainable<JQueryWithSelector>;

        /**
         * Just like cy.visit(), but uses the test site URL as base.
         * @param path Path to visit.
         */
        visitTestSite(path: string): Chainable<AUTWindow>;

        /**
         * Request the backend to reset the database and all the settings to test defaults.
         */
        backendReset(): void;

        /**
         * Request the backend to update the given dynamic config item.
         */
        backendSetDynConfigItem(key: string, value: string): void;

        /**
         * Obtain and return all sent emails from the backend.
         */
        backendGetSentEmails(): Chainable<SentMail[]>;
    }

    // noinspection JSUnusedGlobalSymbols
    interface Chainer<Subject> {
        (chainer:
             'arrayMatch'  | 'not.arrayMatch'  |
             'matrixMatch' | 'not.matrixMatch' |
             'yamlMatch'   | 'not.yamlMatch'   |
             'be.anchor'   | 'not.be.anchor'
        ): Chainable<Subject>;
    }
}
