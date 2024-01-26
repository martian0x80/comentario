import { DOMAINS, PATHS, REGEXES, USERS } from '../../../../../support/cy-utils';

context('Comment Properties page', () => {

    const pagePath = PATHS.manage.domains.id(DOMAINS.localhost.id).comments + '/64fb0078-92c8-419d-98ec-7f22c270ef3a';
    const commentText = 'Captain, I\'ve plotted our course, and I suggest we take the eastern route. It\'ll take us a bit longer, but we\'ll avoid any bad weather.';
    const commentLink = 'http://localhost:8000/#comentario-64fb0078-92c8-419d-98ec-7f22c270ef3a';

    const makeAliases = (modButtons: boolean, delButton: boolean) => {
        cy.get('app-comment-properties').as('commentProps');

        // Heading
        cy.get('@commentProps').find('h1').should('have.text', 'Comment properties').and('be.visible');

        // Details
        cy.get('@commentProps').find('#comment-detail-table').as('commentDetails');

        // Text
        cy.get('@commentProps').find('.comment-text').as('commentText');

        // Buttons
        if (modButtons) {
            cy.get('@commentProps').contains('button', 'Approve').as('btnApprove').should('be.visible').and('be.enabled');
            cy.get('@commentProps').contains('button', 'Reject') .as('btnReject') .should('be.visible').and('be.enabled');
        } else {
            cy.get('@commentProps').contains('button', 'Approve').should('not.exist');
            cy.get('@commentProps').contains('button', 'Reject') .should('not.exist');
        }
        if (delButton) {
            cy.get('@commentProps').contains('button', 'Delete').as('btnDelete').should('be.visible').and('be.enabled');
        } else {
            cy.get('@commentProps').contains('button', 'Delete').should('not.exist');
        }
    };

    const delComment = () => {
        cy.get('@btnDelete').click();
        cy.confirmationDialog('Are you sure you want to delete this comment?').dlgButtonClick('Delete comment');
    };

    const checkButtonsActive = (approved: boolean, rejected: boolean, deleted: boolean) => {
        cy.get('@btnApprove').hasClass('active').its(0).should('eq', approved);
        cy.get('@btnReject') .hasClass('active').its(0).should('eq', rejected);
        cy.get('@btnDelete') .hasClass('active').its(0).should('eq', deleted);
    };

    //------------------------------------------------------------------------------------------------------------------

    beforeEach(cy.backendReset);

    context('unauthenticated user', () => {

        [
            {name: 'superuser',  user: USERS.root,           dest: 'back'},
            {name: 'owner',      user: USERS.ace,            dest: 'back'},
            {name: 'moderator',  user: USERS.king,           dest: 'back'},
            {name: 'commenter',  user: USERS.commenterTwo,   dest: 'back'},
            {name: 'readonly',   user: USERS.commenterThree, dest: 'back'},
            {name: 'non-domain', user: USERS.commenterOne,   dest: 'to Domain Manager', redir: PATHS.manage.domains},
        ]
            .forEach(test =>
                it(`redirects ${test.name} user to login and ${test.dest}`, () =>
                    cy.verifyRedirectsAfterLogin(pagePath, test.user, test.redir)));
    });

    it('stays on the page after reload', () =>
        cy.verifyStayOnReload(pagePath, USERS.commenterTwo));

    context('shows properties', () => {

        it('for superuser', () => {
            cy.loginViaApi(USERS.root, pagePath);
            makeAliases(true, true);

            // Check properties
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',      commentLink],
                ['Parent comment', '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',    '/'],
                ['Status',         'Approved'],
                ['Score',          '4'],
                ['Sticky',         ''],
                ['Created',        REGEXES.datetime],
                ['Created by',     'C\nCommenter Two (two@blog.com)'],
                ['Moderated',      REGEXES.datetime],
                ['Moderated by',   'C\nCommenter Two (two@blog.com)'],
            ]);

            // Check buttons
            checkButtonsActive(true, false, false);

            // Check text
            cy.get('@commentText').should('be.visible').and('have.text', commentText);

            // Unapprove the comment
            cy.get('@btnApprove').click();
            checkButtonsActive(false, false, false);

            // Check properties: there's a pending reason, "moderated by" changed
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',                 commentLink],
                ['Parent comment',            '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',               '/'],
                ['Status',                    'Pending'],
                ['Reason for pending status', `Set to pending by ${USERS.root.name} <${USERS.root.email}>`],
                ['Score',                     '4'],
                ['Sticky',                    ''],
                ['Created',                   REGEXES.datetime],
                ['Created by',                'C\nCommenter Two (two@blog.com)'],
                ['Moderated',                 REGEXES.datetime],
                ['Moderated by',              'R\nRoot (root@comentario.app)' + 'YOU'],
            ]);

            // Re-approve the comment
            cy.get('@btnApprove').click();
            checkButtonsActive(true, false, false);
            cy.get('@commentDetails').contains('dt', 'Status').next().should('have.text', 'Approved');

            // Reject the comment
            cy.get('@btnReject').click();
            checkButtonsActive(false, true, false);
            cy.get('@commentDetails').contains('dt', 'Status').next().should('have.text', 'Rejected');

            // Unreject the comment
            cy.get('@btnReject').click();
            checkButtonsActive(false, false, false);
            cy.get('@commentDetails').contains('dt', 'Status').next().should('have.text', 'Pending');

            // Delete the comment - all buttons and the text disappear
            delComment();
            cy.get('@btnApprove') .should('not.exist');
            cy.get('@btnReject')  .should('not.exist');
            cy.get('@btnDelete')  .should('not.exist');
            cy.get('@commentText').should('not.exist');

            // Check properties
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',      commentLink],
                ['Parent comment', '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',    '/'],
                ['Status',         'Deleted'],
                ['Score',          '4'],
                ['Sticky',         ''],
                ['Created',        REGEXES.datetime],
                ['Created by',     'C\nCommenter Two (two@blog.com)'],
                ['Moderated',      REGEXES.datetime],
                ['Moderated by',   'R\nRoot (root@comentario.app)' + 'YOU'],
                ['Deleted',        REGEXES.datetime],
                ['Deleted by',     'R\nRoot (root@comentario.app)' + 'YOU'],
            ]);
        });

        it('for owner user', () => {
            cy.loginViaApi(USERS.ace, pagePath);
            makeAliases(true, true);

            // Check properties
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',      commentLink],
                ['Parent comment', '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',    '/'],
                ['Status',         'Approved'],
                ['Score',          '4'],
                ['Sticky',         ''],
                ['Created',        REGEXES.datetime],
                ['Created by',     'C\nCommenter Two (two@blog.com)'],
                ['Moderated',      REGEXES.datetime],
                ['Moderated by',   'C\nCommenter Two'],
            ]);

            // Check buttons
            checkButtonsActive(true, false, false);

            // Check text
            cy.get('@commentText').should('be.visible').and('have.text', commentText);

            // Unapprove the comment
            cy.get('@btnApprove').click();
            checkButtonsActive(false, false, false);
            cy.get('@commentDetails').contains('dt', 'Status').next().should('have.text', 'Pending');

            // Check properties: there's a pending reason, "moderated by" changed
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',                 commentLink],
                ['Parent comment',            '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',               '/'],
                ['Status',                    'Pending'],
                ['Reason for pending status', `Set to pending by ${USERS.ace.name} <${USERS.ace.email}>`],
                ['Score',                     '4'],
                ['Sticky',                    ''],
                ['Created',                   REGEXES.datetime],
                ['Created by',                'C\nCommenter Two (two@blog.com)'],
                ['Moderated',                 REGEXES.datetime],
                ['Moderated by',              'Captain Ace' + 'YOU'],
            ]);

            // Delete the comment - all buttons and the text disappear
            delComment();
            cy.get('@btnApprove') .should('not.exist');
            cy.get('@btnReject')  .should('not.exist');
            cy.get('@btnDelete')  .should('not.exist');
            cy.get('@commentText').should('not.exist');
            cy.get('@commentDetails').contains('dt', 'Status').next().should('have.text', 'Deleted');

            // Check properties
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',      commentLink],
                ['Parent comment', '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',    '/'],
                ['Status',         'Deleted'],
                ['Score',          '4'],
                ['Sticky',         ''],
                ['Created',        REGEXES.datetime],
                ['Created by',     'C\nCommenter Two (two@blog.com)'],
                ['Moderated',      REGEXES.datetime],
                ['Moderated by',   'Captain Ace' + 'YOU'],
                ['Deleted',        REGEXES.datetime],
                ['Deleted by',     'Captain Ace' + 'YOU'],
            ]);
        });

        it('for moderator user', () => {
            cy.loginViaApi(USERS.king, pagePath);
            makeAliases(true, true);

            // Check properties
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',      commentLink],
                ['Parent comment', '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',    '/'],
                ['Status',         'Approved'],
                ['Score',          '4'],
                ['Sticky',         ''],
                ['Created',        REGEXES.datetime],
                ['Created by',     'C\nCommenter Two'],
                ['Moderated',      REGEXES.datetime],
            ]);

            // Check buttons
            checkButtonsActive(true, false, false);

            // Check text
            cy.get('@commentText').should('be.visible').and('have.text', commentText);

            // Unapprove the comment
            cy.get('@btnApprove').click();
            checkButtonsActive(false, false, false);
            cy.get('@commentDetails').contains('dt', 'Status').next().should('have.text', 'Pending');

            // Check properties: there's a pending reason, "moderated by" changed
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',                 commentLink],
                ['Parent comment',            '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',               '/'],
                ['Status',                    'Pending'],
                ['Reason for pending status', `Set to pending by ${USERS.king.name} <${USERS.king.email}>`],
                ['Score',                     '4'],
                ['Sticky',                    ''],
                ['Created',                   REGEXES.datetime],
                ['Created by',                'C\nCommenter Two'],
                ['Moderated',                 REGEXES.datetime],
                ['Moderated by',              'E\nEngineer King' + 'YOU'],
            ]);

            // Delete the comment - all buttons and the text disappear
            delComment();
            cy.get('@btnApprove') .should('not.exist');
            cy.get('@btnReject')  .should('not.exist');
            cy.get('@btnDelete')  .should('not.exist');
            cy.get('@commentText').should('not.exist');
            cy.get('@commentDetails').contains('dt', 'Status').next().should('have.text', 'Deleted');

            // Check properties
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',      commentLink],
                ['Parent comment', '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',    '/'],
                ['Status',         'Deleted'],
                ['Score',          '4'],
                ['Sticky',         ''],
                ['Created',        REGEXES.datetime],
                ['Created by',     'C\nCommenter Two'],
                ['Moderated',      REGEXES.datetime],
                ['Moderated by',   'E\nEngineer King' + 'YOU'],
                ['Deleted',        REGEXES.datetime],
                ['Deleted by',     'E\nEngineer King' + 'YOU'],
            ]);
        });

        it('for commenter who is comment author', () => {
            cy.loginViaApi(USERS.commenterTwo, pagePath);
            makeAliases(false, true);

            // Check properties
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',      commentLink],
                ['Parent comment', '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',    '/'],
                ['Status',         'Approved'],
                ['Score',          '4'],
                ['Sticky',         ''],
                ['Created',        REGEXES.datetime],
                ['Created by',     'C\nCommenter Two' + 'YOU'],
                ['Moderated',      REGEXES.datetime],
                ['Moderated by',   'C\nCommenter Two' + 'YOU'],
            ]);

            // Check text
            cy.get('@commentText').should('be.visible').and('have.text', commentText);

            // Delete the comment - the button and the text disappear
            delComment();
            cy.get('@btnDelete')  .should('not.exist');
            cy.get('@commentText').should('not.exist');
            cy.get('@commentDetails').contains('dt', 'Status').next().should('have.text', 'Deleted');

            // Check properties
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',      commentLink],
                ['Parent comment', '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',    '/'],
                ['Status',         'Deleted'],
                ['Score',          '4'],
                ['Sticky',         ''],
                ['Created',        REGEXES.datetime],
                ['Created by',     'C\nCommenter Two' + 'YOU'],
                ['Moderated',      REGEXES.datetime],
                ['Moderated by',   'C\nCommenter Two' + 'YOU'],
                ['Deleted',        REGEXES.datetime],
                ['Deleted by',     'C\nCommenter Two' + 'YOU'],
            ]);
        });

        it('for another commenter', () => {
            cy.loginViaApi(USERS.commenterThree, pagePath);
            makeAliases(false, false);

            // Check properties
            cy.get('@commentDetails').dlTexts().should('matrixMatch', [
                ['Permalink',      commentLink],
                ['Parent comment', '788c0b17-a922-4c2d-816b-98def34a0008'],
                ['Domain page',    '/'],
                ['Status',         'Approved'],
                ['Score',          '4'],
                ['Sticky',         ''],
                ['Created',        REGEXES.datetime],
                ['Created by',     'C\nCommenter Two'],
            ]);

            // Check text
            cy.get('@commentText').should('be.visible').and('have.text', commentText);
        });
    });
});
