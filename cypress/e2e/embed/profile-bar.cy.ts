import { DOMAINS, PATHS, TEST_PATHS, USERS } from '../../support/cy-utils';
import { EmbedUtils } from '../../support/cy-embed-utils';

// eslint-disable-next-line no-only-or-skip-tests/no-skip-tests
const itHeaded = Cypress.browser.isHeaded ? it : it.skip;

context('Profile bar', () => {

    beforeEach(cy.backendReset);

    context('Sign in button', () => {

        // Because of the login popup window, this only works with a "headed" browser
        itHeaded('triggers SSO auth when only interactive SSO is enabled', () => {
            cy.backendPatchDomain(DOMAINS.localhost.id, {
                authLocal:         false,
                authAnonymous:     false,
                ssoNonInteractive: false
            });
            cy.backendUpdateDomainIdps(DOMAINS.localhost.id, []);
            cy.testSiteVisit(TEST_PATHS.comments);
            EmbedUtils.makeAliases({anonymous: true});

            // Click on "Sign in" and get immediately logged in
            cy.get('@profileBar').contains('button', 'Sign in').click();
            cy.testSiteIsLoggedIn(USERS.johnDoeSso.name);
        });

        [
            {
                name:     'only non-interactive SSO is enabled',
                readonly: false,
                notice:   undefined,
                props:    {authLocal: false, authAnonymous: false}},
            {
                name:     'only anonymous is enabled',
                readonly: false,
                notice:   undefined,
                props:    {authLocal: false, authSso: false}},
            {
                name:     'no auth is enabled',
                readonly: true,
                notice:   'This domain has no authentication method available. You cannot add new comments.',
                props:    {authLocal: false, authAnonymous: false, authSso: false}},
        ]
            .forEach(test =>
                it(`isn't available when ${test.name}`, () => {
                    // Update domain auth props
                    cy.backendPatchDomain(DOMAINS.localhost.id, test.props);
                    // Disable all federated providers
                    cy.backendUpdateDomainIdps(DOMAINS.localhost.id, []);
                    // Visit and check the test site
                    cy.testSiteVisit(TEST_PATHS.comments);
                    EmbedUtils.makeAliases({anonymous: true, login: false, readonly: test.readonly, notice: test.notice});
                }));
    });

    context('when logged in', () => {

        [
            {name: 'superuser',   user: USERS.root,           isModerator: true},
            {name: 'owner',       user: USERS.ace,            isModerator: true},
            {name: 'moderator',   user: USERS.king,           isModerator: true},
            {name: 'commenter',   user: USERS.commenterTwo,   isModerator: false},
            {name: 'read-only',   user: USERS.commenterThree, isModerator: false},
            {name: 'non-domain',  user: USERS.commenterOne,   isModerator: false},
        ]
            .forEach(test =>
                context(`as ${test.name} user`, () => {

                    beforeEach(() => {
                        // Make the user logged-in
                        cy.testSiteLoginViaApi(test.user, TEST_PATHS.comments);
                        EmbedUtils.makeAliases();

                        // Make button aliases
                        if (test.isModerator) {
                            cy.get('@profileBar').find('button[title="Lock"]').as('btnLock').should('be.visible');
                        } else {
                            cy.get('@profileBar').find('button[title="Lock"]').should('not.exist');
                        }
                        cy.get('@profileBar').find('button[title="Settings"]').as('btnSettings').should('be.visible');
                        cy.get('@profileBar').find('button[title="Logout"]')  .as('btnLogout')  .should('be.visible');
                    });

                    it('logs user out', () => {
                        // Verify logout works
                        cy.get('@btnLogout').click();

                        // Verify there's a "Sign in" button again
                        EmbedUtils.makeAliases({anonymous: true});
                    });

                    it('allows to update settings', () => {
                        // Click on the gear button: the Settings dialog appears
                        cy.get('@btnSettings').click();
                        cy.get('@root').find('.comentario-dialog').as('settingsDialog').should('be.visible')
                            .contains('.comentario-dialog-header', `User settings for ${DOMAINS.localhost.name}`).should('be.visible');

                        // Check moderator notifications
                        if (test.isModerator) {
                            cy.get('@settingsDialog').find('#comentario-cb-notify-moderator')
                                .should('be.visible').and('be.checked')
                                .clickLabel()
                                .should('not.be.checked');
                        } else {
                            cy.get('@settingsDialog').find('#comentario-cb-notify-moderator').should('not.exist');
                        }

                        // Check reply notifications
                        cy.get('@settingsDialog').find('#comentario-cb-notify-replies')
                            .should('be.visible').and('be.checked')
                            .clickLabel()
                            .should('not.be.checked');

                        // Check profile link
                        cy.get('@settingsDialog').contains('Edit Comentario profile')
                            .should(
                                'be.anchor',
                                Cypress.config().baseUrl + PATHS.manage.account.profile,
                                {newTab: true, noOpener: true});

                        // Click "Save" and the dialog disappears
                        cy.intercept('POST', '/api/embed/auth/user').as('fetchPrincipal');
                        cy.get('@settingsDialog').find('button[type=submit]').should('have.text', 'Save').click();
                        cy.get('@settingsDialog').should('not.exist');

                        // Wait for the principal to get re-fetched
                        cy.wait('@fetchPrincipal');

                        // Open the dialog again and check the settings
                        cy.get('@btnSettings').click();
                        cy.get('@root').find('.comentario-dialog').as('settingsDialog').should('be.visible');
                        cy.get('@settingsDialog').find('#comentario-cb-notify-moderator').should(test.isModerator ? 'not.be.checked' : 'not.exist');
                        cy.get('@settingsDialog').find('#comentario-cb-notify-replies')  .should('not.be.checked')
                            // Click on Escape and it's gone again
                            .type('{esc}');
                        cy.get('@settingsDialog').should('not.exist');
                    });

                    if (test.isModerator) {
                        it('allows to toggle page lock', () => {
                            // Click on Lock and the page gets read-only
                            cy.get('@btnLock').click();
                            EmbedUtils.makeAliases({readonly: true, notice: 'This thread is locked. You cannot add new comments.'});
                            cy.get('@profileBar').find('button[title="Lock"]')  .should('not.exist');
                            cy.get('@profileBar').find('button[title="Unlock"]').should('be.visible')
                                // Click on Unlock
                                .click();

                            // Page is writable again, the notice is gone
                            EmbedUtils.makeAliases();
                            cy.get('@profileBar').find('button[title="Unlock"]').should('not.exist');
                            cy.get('@profileBar').find('button[title="Lock"]')  .should('be.visible');
                        });
                    }
                }));

    });
});
