import { COOKIES, DOMAINS, TEST_PATHS, USERS } from '../../support/cy-utils';

context('Live comment update', () => {

    const host = DOMAINS.localhost.host;
    const pagePath = TEST_PATHS.comments;

    beforeEach(cy.backendReset);

    it('updates comments for anonymous user', () => {
        cy.testSiteVisit(pagePath);
        cy.commentTree('html', 'author', 'score', 'sticky')
            .should('yamlMatch',
                // language=yaml
                `
                - author: Anonymous
                  html: <p>This is a <b>root</b>, sticky comment</p>
                  score: 0
                  sticky: true
                `);

        // Add a comment via API and expect a new comment to arrive
        cy.testSiteLoginViaApi(USERS.ace);
        cy.commentAddViaApi(host, pagePath, null, 'New comment');
        cy.commentTree('html', 'author', 'score', 'sticky')
            .should('yamlMatch',
                // language=yaml
                `
                - author: Anonymous
                  html: <p>This is a <b>root</b>, sticky comment</p>
                  score: 0
                  sticky: true
                - author: Captain Ace
                  html: <p>New comment</p>
                  score: 0
                  sticky: false
                `);

        // Now add a child comment
        cy.testSiteLoginViaApi(USERS.king);
        cy.commentAddViaApi(host, pagePath, '0b5e258b-ecc6-4a9c-9f31-f775d88a258b', 'Another comment');
        cy.commentTree('html', 'author', 'score', 'sticky')
            .should('yamlMatch',
                // language=yaml
                `
                - author: Anonymous
                  html: <p>This is a <b>root</b>, sticky comment</p>
                  score: 0
                  sticky: true
                  children:
                  - author: Engineer King
                    html: <p>Another comment</p>
                    score: 0
                    sticky: false
                - author: Captain Ace
                  html: <p>New comment</p>
                  score: 0
                  sticky: false
                `);
    });

    it('updates comments for authenticated user', () => {
        cy.testSiteLoginViaApi(USERS.ace, pagePath);
        cy.commentTree('html', 'author', 'score', 'sticky', 'pending')
            .should('yamlMatch',
                // language=yaml
                `
                - author: Anonymous
                  html: <p>This is a <b>root</b>, sticky comment</p>
                  score: 0
                  sticky: true
                  pending: false
                `);

        // Add a child comment
        cy.testSiteLoginViaApi(USERS.king);
        cy.commentAddViaApi(host, pagePath, '0b5e258b-ecc6-4a9c-9f31-f775d88a258b', 'Foo comment');
        cy.commentTree('html', 'author', 'score', 'sticky', 'pending')
            .should('yamlMatch',
                // language=yaml
                `
                - author: Anonymous
                  html: <p>This is a <b>root</b>, sticky comment</p>
                  score: 0
                  sticky: true
                  pending: false
                  children:
                  - author: Engineer King
                    html: <p>Foo comment</p>
                    score: 0
                    sticky: false
                    pending: false
                `);

        // Add an anonymous comment
        cy.clearCookie(COOKIES.embedCommenterSession);
        cy.commentAddViaApi(host, pagePath, null, 'Bar comment').its('body.comment.id').as('anonCommentId');
        cy.commentTree('html', 'author', 'score', 'sticky', 'pending')
            .should('yamlMatch',
                // language=yaml
                `
                - author: Anonymous
                  html: <p>This is a <b>root</b>, sticky comment</p>
                  score: 0
                  sticky: true
                  pending: false
                  children:
                  - author: Engineer King
                    html: <p>Foo comment</p>
                    score: 0
                    sticky: false
                    pending: false
                - author: Anonymous
                  html: <p>Bar comment</p>
                  score: 0
                  sticky: false
                  pending: true
                `);

        // Delete the first comment
        cy.testSiteLoginViaApi(USERS.king);
        cy.commentDeleteViaApi('0b5e258b-ecc6-4a9c-9f31-f775d88a258b');
        cy.commentTree('html', 'author', 'score', 'sticky', 'pending')
            .should('yamlMatch',
                // language=yaml
                `
                - author: Anonymous
                  html: (Deleted by moderator) # Text is gone
                  score: null                   # No score anymore
                  sticky: false                 # Not sticky anymore
                  pending: false
                  children:
                  - author: Engineer King
                    html: <p>Foo comment</p>
                    score: 0
                    sticky: false
                    pending: false
                - author: Anonymous
                  html: <p>Bar comment</p>
                  score: 0
                  sticky: false
                  pending: true
                `);

        // Approve the last added comment
        cy.get<string>('@anonCommentId').then(id => cy.commentModerateViaApi(id, true));
        cy.commentTree('html', 'author', 'score', 'sticky', 'pending')
            .should('yamlMatch',
                // language=yaml
                `
                - author: Anonymous
                  html: (Deleted by moderator)
                  score: null
                  sticky: false
                  pending: false
                  children:
                  - author: Engineer King
                    html: <p>Foo comment</p>
                    score: 0
                    sticky: false
                    pending: false
                - author: Anonymous
                  html: <p>Bar comment</p>
                  score: 0
                  sticky: false
                  pending: false  # Not pending anymore
                `);

        // Vote for the last comment
        cy.get<string>('@anonCommentId').then(id => cy.commentVoteViaApi(id, -1));
        cy.commentTree('html', 'author', 'score', 'sticky', 'pending')
            .should('yamlMatch',
                // language=yaml
                `
                - author: Anonymous
                  html: (Deleted by moderator)
                  score: null
                  sticky: false
                  pending: false
                  children:
                  - author: Engineer King
                    html: <p>Foo comment</p>
                    score: 0
                    sticky: false
                    pending: false
                - author: Anonymous
                  html: <p>Bar comment</p>
                  score: -1  # Score is updated
                  sticky: false
                  pending: false
                `);

        // Sticky the last comment
        cy.get<string>('@anonCommentId').then(id => cy.commentStickyViaApi(id, true));
        cy.commentTree('html', 'author', 'score', 'sticky', 'pending')
            .should('yamlMatch',
                // language=yaml
                `
                - author: Anonymous
                  html: (Deleted by moderator)
                  score: null
                  sticky: false
                  pending: false
                  children:
                  - author: Engineer King
                    html: <p>Foo comment</p>
                    score: 0
                    sticky: false
                    pending: false
                - author: Anonymous
                  html: <p>Bar comment</p>
                  score: -1
                  sticky: true # It's sticky now
                  pending: false
                `);
    });

    it('doesn\'t update comments when disabled', () => {
        // Navigate to the page that has live update disabled
        cy.testSiteLoginViaApi(USERS.ace, TEST_PATHS.attr.noLiveUpdate);
        cy.commentTree('id').should('be.empty');

        // Submit a comment via API
        cy.commentAddViaApi(host, TEST_PATHS.attr.noLiveUpdate, null, 'Phew!');

        // Wait 2 seconds and there's still no comment
        cy.wait(2000);
        cy.commentTree('id').should('be.empty');

        // Reload and the comment is there
        cy.reload();
        cy.commentTree('html', 'author')
            .should('yamlMatch',
                // language=yaml
                `
                - author: Captain Ace
                  html: <p>Phew!</p>
                `);
    });
});
