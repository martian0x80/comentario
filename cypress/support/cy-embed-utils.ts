/** Settings for checking comment page layout. */
export interface LayoutSettings {
    /** Root selector for Comentario, defaults to 'comentario-comments'. */
    rootSelector?: string;
    /** Whether the user is anonymous. */
    anonymous?: boolean;
    /** Whether login button is available (only when anonymous is true). Defaults to true. */
    login?: boolean;
    /** Whether the comments are read-only (also applies when no auth method is available). */
    readonly?: boolean;
    /** Whether root font is applied. Defaults to true. */
    hasRootFont?: boolean;
    /** Moderation notice, if any. */
    notice?: string;
}

export class EmbedUtils {

    /**
     * Check comment page layout and create corresponding aliases.
     */
    static makeAliases(settings?: LayoutSettings) {
        // Check root
        cy.get(settings?.rootSelector || 'comentario-comments').should('be.visible')
            .find('.comentario-root').as('root')
            .should('be.visible')
            .should(settings?.hasRootFont === false ? 'not.have.class' : 'have.class', 'comentario-root-font');

        // Check Profile bar. It won't be "visible" if has no elements because of zero height
        cy.get('@root').find('.comentario-profile-bar').as('profileBar');

        // Check login/logout buttons
        cy.get('@profileBar').contains('button', 'Login')
            .should(settings?.anonymous && (settings?.login ?? true) ? 'be.visible' : 'not.exist');
        cy.get('@profileBar').contains('button', 'Logout')
            .should(settings?.anonymous ? 'not.exist' : 'be.visible');

        // Check main area
        cy.get('@root').find('.comentario-main-area').as('mainArea')
            .should('be.visible');
        if (settings?.readonly) {
            // No add comment host if readonly
            cy.get('@mainArea').find('.comentario-add-comment-host').should('not.exist');
        } else {
            cy.get('@mainArea').find('.comentario-add-comment-host').as('addCommentHost').should('exist');
        }

        // Check sort buttons
        cy.get('@mainArea').find('.comentario-sort-bar').should('be.visible');

        // Check comments
        cy.get('@mainArea').find('.comentario-comments').as('comments').should('exist');

        // Check footer
        cy.get('@root').find('.comentario-footer').as('footer')
            .should('be.visible')
            .find('a')
            .should('have.text', 'Powered by Comentario')
            .should('have.attr', 'href', 'https://comentario.app/');

        // Check any page moderation notice
        cy.get('@mainArea').find('.comentario-page-moderation-notice').should(el => {
            if (settings?.notice) {
                expect(el.text()).eq(settings.notice);
            } else {
                expect(el).not.to.exist;
            }
        });
    };

    /**
     * Find and return a titled option button for a comment with the given ID.
     * @param id Comment ID.
     * @param title Button title.
     */
    static commentOptionButton(id: string, title: string) {
        return cy.get(`.comentario-root #comentario-${id} .comentario-btn-option[title="${title}"]`);
    }

    /**
     * Add a root comment or reply on the current page.
     * @param parentId Parent comment ID. If undefined, a root comment is created.
     * @param markdown Markdown text of the comment.
     * @param clickAnonymous Whether the user will be given an option to submit the comment anonymously in the Login dialog.
     */
    static addComment(parentId: string | undefined, markdown: string, clickAnonymous: boolean) {
        // Focus the add host or click the reply button
        if (parentId) {
            this.commentOptionButton(parentId, 'Reply').click();
        } else {
            cy.get('.comentario-root .comentario-add-comment-host').focus();
        }

        // Verify the editor is shown
        cy.get('.comentario-root form.comentario-comment-editor').as('editor').should('be.visible');

        // Enter comment text
        cy.get('@editor').find('textarea').should('be.focused').setValue(markdown);

        // Submit the comment
        cy.get('@editor').find('.comentario-comment-editor-buttons button[type=submit]')
            .should('have.text', 'Add Comment')
            .click();

        // If we're to comment anonymously, the Login dialog must appear
        if (clickAnonymous) {
            cy.get('.comentario-root .comentario-dialog').should('be.visible')
                .contains('button', 'Comment anonymously').click();
        }
    }
}
