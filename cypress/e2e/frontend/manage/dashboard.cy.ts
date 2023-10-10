import { PATHS, USERS } from '../../../support/cy-utils';
const { $ } = Cypress;

interface DashboardMetric {
    label:    string;
    sublabel: string;
    value:    number;
}

context('Dashboard', () => {

    // Collect metric cards and return their texts as an array
    const dashboardCardTexts = (): Cypress.Chainable<DashboardMetric[]> => cy.get('app-dashboard app-metric-card')
        .then(cards =>
            cards.map((_, card) =>
                {
                    const c = $(card);
                    return {
                        label:    c.find('.metric-label').text(),
                        sublabel: c.find('.metric-sublabel').text(),
                        value:    Number(c.find('.metric-value').text()),
                    };
                })
                .get());

    beforeEach(cy.backendReset);

    it('redirects user to login and back to Dashboard', () => {
        cy.visit(PATHS.manage.dashboard);
        cy.isAt(PATHS.auth.login);
        cy.login(USERS.commenterOne, {goTo: false, redirectPath: PATHS.manage.dashboard});
    });

    it('stays on the page after reload', () => {
        cy.loginViaApi(USERS.commenterOne, PATHS.manage.dashboard);
        cy.reload();
        cy.isAt(PATHS.manage.dashboard);
    });

    it('shows metrics for user without domains', () => {
        cy.loginViaApi(USERS.commenterOne, PATHS.manage.dashboard);
        dashboardCardTexts().should('yamlMatch',
            // language=yaml
            `
            - label:    Domains
              sublabel: you're commenter on
              value:    0
            `);
    });

    it('shows metrics for commenter user', () => {
        cy.loginViaApi(USERS.commenterTwo, PATHS.manage.dashboard);
        dashboardCardTexts().should('yamlMatch',
            // language=yaml
            `
            - label:    Domains
              sublabel: you're commenter on
              value:    1
            `);
    });

    it('shows metrics for owner user', () => {
        cy.loginViaApi(USERS.ace, PATHS.manage.dashboard);
        dashboardCardTexts().should('yamlMatch',
            // language=yaml
            `
            - label:    Domains
              sublabel: you own
              value:    1
            - label:    Domains
              sublabel: you're commenter on
              value:    0
            - label:    Pages
              sublabel: you moderate
              value:    12
            - label:    Domain users
              sublabel: you manage
              value:    5
            - label:    Comments
              sublabel: total
              value:    30
            - label:    Commenters
              sublabel: total
              value:    6
            `);
    });

    it('shows metrics for user with multiple roles', () => {
        cy.loginViaApi(USERS.king, PATHS.manage.dashboard);
        dashboardCardTexts().should('yamlMatch',
            // language=yaml
            `
            - label:    Domains
              sublabel: you own
              value:    1
            - label:    Domains
              sublabel: you moderate
              value:    1
            - label:    Domains
              sublabel: you're commenter on
              value:    1
            - label:    Domains
              sublabel: you're read-only on
              value:    1
            - label:    Pages
              sublabel: you moderate
              value:    15
            - label:    Domain users
              sublabel: you manage
              value:    1
            - label:    Comments
              sublabel: total
              value:    30
            - label:    Commenters
              sublabel: total
              value:    6
            `);
    });

    it('shows metrics for superuser', () => {
        cy.loginViaApi(USERS.root, PATHS.manage.dashboard);
        dashboardCardTexts().should('yamlMatch',
            // language=yaml
            `
            - label:    Users
              sublabel: total
              value:    15
            - label:    Domains
              sublabel: you're commenter on
              value:    0
            - label:    Pages
              sublabel: you moderate
              value:    16
            - label:    Domain users
              sublabel: you manage
              value:    8
            - label:    Comments
              sublabel: total
              value:    31
            - label:    Commenters
              sublabel: total
              value:    6
            `);
    });
});
