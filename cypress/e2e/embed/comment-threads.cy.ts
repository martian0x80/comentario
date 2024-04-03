import { DOMAINS, TEST_PATHS, USERS } from '../../support/cy-utils';
import { EmbedUtils } from '../../support/cy-embed-utils';

context('Comment threads', () => {

    before(cy.backendReset);

    /** Post-login routine for the "Dynamic Comentario" page. */
    const insertDynamic = () => {
        // No Comentario initially
        cy.get('comentario-comments').should('not.exist');

        // Click on "Insert Comentario" three times, there must appear 3 instances
        cy.contains('button', 'Insert Comentario').click().click().click();
    };

    const initComentario = () => {
        // There's comments tag but Comentario isn't running
        cy.get('comentario-comments .comentario-root').as('root').should('exist');
        cy.get('@root').find('.comentario-profile-bar').should('not.exist');
        cy.get('@root').find('.comentario-main-area')  .should('not.exist');
        cy.get('@root').find('.comentario-footer')     .should('not.exist');

        // Init Comentario
        cy.contains('button', 'Run Comentario').click();
    };

    const checkCssOverride = () => {
        // Verify the original CSS and the override are both applied
        cy.document().find(`head link[href="${Cypress.config().baseUrl}/comentario.css"]`).should('have.attr', 'rel', 'stylesheet');
        cy.document().find('head link[href="/css-override.css"]').should('have.attr', 'rel', 'stylesheet');
    };

    const checkNoCssOverride = () => {
        // Verify neither CSS link exists
        cy.document().find('head link[href$="/comentario.css"]')  .should('not.exist');
        cy.document().find('head link[href$="/css-override.css"]').should('not.exist');
    };

    const checkUnnesting = () => {
        // Verify comment styles: they must be "unnested" starting from the 2nd level
        cy.get('comentario-comments .comentario-comments .comentario-card .comentario-card-children')
            .hasClass('comentario-card-children-unnest').should('arrayMatch', [false, true, true, true, true, true]);
    };

    [
        {name: 'superuser',  user: USERS.root,           isModerator: true},
        {name: 'owner',      user: USERS.ace,            isModerator: true},
        {name: 'moderator',  user: USERS.king,           isModerator: true},
        {name: 'commenter',  user: USERS.commenterTwo,   isModerator: false},
        {name: 'read-only',  user: USERS.commenterThree, isModerator: false},
        {name: 'non-domain', user: USERS.commenterOne,   isModerator: false},
        {name: 'anonymous',  user: USERS.anonymous,      isModerator: false},
    ]
        .forEach(userTest => context(`is shown for ${userTest.name} user`, () => {

            before(cy.backendReset);

            [
                {
                    path:        TEST_PATHS.home,
                    heading:     'Comentario test',
                    subheading:  true,
                    verifyLogin: true,
                    comments:
                        // language=yaml
                        `
                        - id: ef81dbe5-22f6-4d90-958f-834e6f2cdc63
                          author: Captain Ace
                          subtitle: 3 hours ago
                          html: <p>Alright crew, let's gather around for a quick meeting. We've got a <b>long</b> voyage ahead of us, and I want to make sure everyone is on the same page.</p>
                          score: 8
                          sticky: false
                          children:
                          - id: 40330ddf-13de-4921-b123-7a32057988cd
                            author: Engineer King
                            subtitle: 2 hours ago
                            html: <p>What's on the agenda, captain?</p>
                            score: 0
                            sticky: false
                            children:
                            - id: 788c0b17-a922-4c2d-816b-98def34a0008
                              author: Captain Ace
                              subtitle: 2 hours ago
                              html: <p>First off, we need to make sure the engine is in good working order. Any issues we need to address, <em>engineer</em>?</p>
                              score: 0
                              sticky: false
                              children:
                              - id: 82acadba-3e77-4bcd-a366-78c7ff56c3b9
                                author: Engineer King
                                subtitle: 2 hours ago
                                html: <p>Nothing major, captain. Just some routine maintenance to do, but we should be good to go soon.</p>
                                score: 0
                                sticky: false
                              - id: 64fb0078-92c8-419d-98ec-7f22c270ef3a
                                author: Commenter Two
                                subtitle: 2 hours ago
                                html: <p>Captain, I've plotted our course, and I suggest we take the eastern route. It'll take us a bit longer, but we'll avoid any bad weather.</p>
                                score: 4
                                sticky: false
                                children:
                                - id: e8331f48-516d-45fc-80a1-d1b2d5a21d08
                                  author: Captain Ace
                                  subtitle: 2 hours ago
                                  html: <p>Good work, navigator. That's what I was thinking too.</p>
                                  score: 0
                                  sticky: false
                            - id: 9a93d7bd-80cb-49bd-8dc1-67326df6fcaf
                              author: Captain Ace
                              subtitle: 2 hours ago
                              html: <p>What about supplies, cook?</p>
                              score: 0
                              sticky: false
                              children:
                              - id: da05d978-9218-4263-886e-542068251787
                                author: Cook Queen
                                subtitle: 2 hours ago, edited by author 13 minutes ago
                                html: <p>We've got enough food 🍖 and water 🚰 to last us for the whole journey, captain. But I do have a request. Could we get some fresh vegetables 🥕🥔🍅 and fruit 🍎🍐🍌 at our next port stop? It'll help us avoid scurvy.</p>
                                score: 4
                                sticky: false
                                children:
                                - id: 4922acc5-0330-4d1a-8092-ca7c67536b08
                                  author: Captain Ace
                                  subtitle: 2 hours ago
                                  html: <p>Absolutely, cook. I'll make a note of it.</p>
                                  score: 0
                                  sticky: false
                        - id: bc460a63-f256-47e3-8915-3931acad132a
                          author: Captain Ace
                          subtitle: 2 hours ago
                          html: <p>Now, is there anything else anyone wants to bring up?</p>
                          score: 0
                          sticky: false
                          children:
                          - id:  5f066198-03ab-41f8-bd80-c4efaeafd153
                            author: Engineer King
                            subtitle: 2 hours ago
                            html: <p>Captain, I've been noticing some strange vibrations in the engine room. It's nothing too serious, but I'd like to take a look at it just to be safe.</p>
                            score: 0
                            sticky: false
                            children:
                            - id: 00e7320a-ecb4-44f4-84ca-ffc2f8c62729
                              author: Captain Ace
                              subtitle: 2 hours ago
                              html: <p>Alright, engineer. Let's schedule a time for you to do a full inspection. I want to make sure everything is shipshape before we set sail.</p>
                              score: 2
                              sticky: false
                          - id: cb057a9b-e293-4e15-bdb9-c11880cb53bf
                            author: Navigator Jack
                            subtitle: 2 hours ago
                            html: <p><strong>Captain</strong>, one more thing. We'll be passing through some pirate-infested waters soon. Should we be concerned?</p>
                            score: -2
                            sticky: false
                            children:
                            - id: 72314bae-a05d-4551-91df-270802e6b003
                              author: Captain Ace
                              subtitle: 2 hours ago
                              html: <p>Good point, navigator. I'll make sure our crew is well-armed and that we have extra lookouts posted. Safety is our top priority, after all.</p>
                              score: 0
                              sticky: false
                              children:
                              - id: 8f31a61b-e1e6-4090-a426-52ce91a5181b
                                author: Cook Queen
                                subtitle: 2 hours ago
                                html: <p>I can whip up some extra spicy food to make sure any pirates who try to board us get a taste of their own medicine! 🤣</p>
                                score: 6
                                sticky: false
                                children:
                                - id: 069f98da-bbc5-40ad-8c91-e8a089288ecb
                                  author: Captain Ace
                                  subtitle: 2 hours ago
                                  html: <p>Let's hope it doesn't come to that, cook. But it's good to know we have you on our side.</p><p>Alright, everyone, let's get to work. We've got a long journey ahead of us!</p>
                                  score: 0
                                  sticky: false
                        `,
                },
                {
                    path:        TEST_PATHS.comments,
                    heading:     'Comments',
                    subheading:  true,
                    verifyLogin: true,
                    comments:
                        // language=yaml
                        `
                        - id: 0b5e258b-ecc6-4a9c-9f31-f775d88a258b
                          author: Anonymous
                          subtitle: 3 hours ago
                          html: <p>This is a <b>root</b>, sticky comment</p>
                          score: 0
                          sticky: true
                        `,
                },
                {
                    path:          TEST_PATHS.double,
                    heading:       'Double',
                    subheading:    true,
                    verifyLogin:   false, // Two Comentario instances screw the user name check
                    rootSelectors: ['#com-1', '#com-2'],
                    comments:
                        // language=yaml
                        `
                        - id: 7fbec006-b484-4372-b6db-f01177ee1dfa
                          author: Captain Ace
                          subtitle: 3 hours ago
                          html: <p>Doubling down</p>
                          score: 1
                          sticky: false
                          children:
                          - id: f08639de-ab7b-4032-bdce-a021bf07e596
                            author: Commenter Two
                            subtitle: 3 hours ago
                            html: <p>Children double, too</p>
                            score: 2
                            sticky: false
                        `,
                },
                {
                    path:          TEST_PATHS.dynamic,
                    heading:       'Dynamic insertion',
                    subheading:    false,
                    verifyLogin:   false, // No Comentario until it's dynamically inserted
                    postLogin:     insertDynamic,
                    rootSelectors: ['#com-1', '#com-2', '#com-3'],
                    comments:
                        // This page contains a pending comment so its appearance differs for a moderator
                        // language=yaml
                        userTest.isModerator ?
                        `
                        - id: 7a803058-8a80-4e64-96f3-bb1e881597c4
                          author: Captain Ace
                          subtitle: 3 hours ago
                          html: <p>I am dynamic 🚀</p>
                          score: 65
                          sticky: true
                          children:
                          - id: 5c3ed3a3-d1a9-484c-b2c5-b81904700b86
                            author: Anonymous
                            subtitle: 3 hours ago
                            html: <p>Phishy reply</p>
                            score: 0
                            sticky: false
                        ` :
                        `
                        - id: 7a803058-8a80-4e64-96f3-bb1e881597c4
                          author: Captain Ace
                          subtitle: 3 hours ago
                          html: <p>I am dynamic 🚀</p>
                          score: 65
                          sticky: true
                        `,
                },
                {
                    path:          TEST_PATHS.noComment,
                    heading:       'No comment',
                    subheading:    true,
                    verifyLogin:   true,
                    layoutOptions: {hasSortBar: false},
                    comments:      '',
                },
                {
                    path:          TEST_PATHS.readonly,
                    heading:       'Read-only',
                    subheading:    true,
                    verifyLogin:   true,
                    layoutOptions: {readonly: true, hasSortBar: false, notice: 'This thread is locked. You cannot add new comments.'},
                    comments:      '',
                },
                {
                    path:        TEST_PATHS.attr.autoInit,
                    heading:     'Attribute: auto-init=false',
                    subheading:  true,
                    verifyLogin: false, // No Comentario until it's initialised
                    postLogin:   initComentario,
                    comments:
                        // language=yaml
                        `
                        - id: 80422207-7bea-4f56-9f07-01736306d544
                          author: Captain Ace
                          subtitle: 3 hours ago
                          html: <p>Auto-init OK</p>
                          score: 3
                          sticky: true
                          children:
                          - id: cbbaf220-6cc4-4160-af43-9fdd6f2ec6fe
                            author: Commenter Three
                            subtitle: 3 hours ago
                            html: <p>Auto-init child</p>
                            score: 0
                            sticky: false
                        `,
                },
                {
                    path:          TEST_PATHS.attr.noFonts,
                    heading:       'Attribute: no-fonts=true',
                    subheading:    true,
                    verifyLogin:   true,
                    layoutOptions: {hasRootFont: false},
                    comments:
                        // language=yaml
                        `
                        - id: 69adf987-caec-4ad5-ae86-82c8f607d17a
                          author: Captain Ace
                          subtitle: 3 hours ago
                          html: <p>No root font for comments</p>
                          score: 0
                          sticky: false
                          children:
                          - id: 29f0a6d8-267e-4ac7-9dac-af0a39ceb1bd
                            author: Anonymous
                            subtitle: 3 hours ago
                            html: <p>No root font child</p>
                            score: 0
                            sticky: false
                        `,
                },
                {
                    path:        TEST_PATHS.attr.cssOverride,
                    heading:     'Attribute: css-override',
                    subheading:  true,
                    verifyLogin: true,
                    postLogin:   checkCssOverride,
                    comments:
                        // language=yaml
                        `
                        - id: a3df5e05-ba17-4fba-be29-e53dba42ecb5
                          author: Captain Ace
                          subtitle: 3 hours ago
                          html: <p>CSS override with crazy colours</p>
                          score: 0
                          sticky: false
                          children:
                          - id: 092b0623-10c4-4ad0-9465-b618943425e5
                            author: Anonymous
                            subtitle: 3 hours ago
                            html: <p>CSS override child</p>
                            score: 0
                            sticky: false
                        `,
                },
                {
                    path:        TEST_PATHS.attr.cssOverrideFalse,
                    heading:     'Attribute: css-override=false',
                    subheading:  true,
                    verifyLogin: true,
                    postLogin:   checkNoCssOverride,
                    comments:
                        // language=yaml
                        `
                        - id: 0cefafcd-070f-442d-99c6-7b794477489f
                          author: Captain Ace
                          subtitle: 3 hours ago
                          html: <p>CSS override disabled</p>
                          score: 0
                          sticky: false
                          children:
                          - id: 7cffd785-f5c5-4464-bf2c-b33997834e4f
                            author: Anonymous
                            subtitle: 3 hours ago
                            html: <p>CSS override disabled child</p>
                            score: 0
                            sticky: false
                        `,
                },
                {
                    path:        TEST_PATHS.attr.pageId,
                    heading:     'Attribute: page-id',
                    subheading:  true,
                    verifyLogin: true,
                    comments:
                        // language=yaml
                        `
                        - id: 1b0398b7-b3c4-422e-a04a-a38efce9c8be
                          author: Captain Ace
                          subtitle: 3 hours ago
                          html: <p>The path of this page is set to <code>/different-page/123</code></p>
                          score: 0
                          sticky: false
                          children:
                          - id: 30ada0fc-d813-4dea-853e-3276052725eb
                            author: Anonymous
                            subtitle: 3 hours ago
                            html: <p>Path override child</p>
                            score: 0
                            sticky: false
                        `,
                },
                {
                    path:        TEST_PATHS.attr.maxLevel,
                    heading:     'Attribute: max-level=2',
                    subheading:  true,
                    verifyLogin: true,
                    postLogin:   checkUnnesting,
                    comments:
                        // language=yaml
                        `
                        - id: c7998a8b-408c-4dbe-9c1b-c422a74e4fcb
                          author: Captain Ace
                          subtitle: 3 hours ago
                          html: <p>Root level comment</p>
                          score: 0
                          sticky: false
                          children:
                          - id: 721870c6-64e1-4f51-9500-92e2bb8250d0
                            author: Engineer King
                            subtitle: 3 hours ago
                            html: <p>2nd level comment</p>
                            score: 0
                            sticky: false
                            children:
                            - id: 1a29d310-8b6b-4cb2-bcaf-5e3346d1aaeb
                              author: Cook Queen
                              subtitle: 3 hours ago
                              html: <p>3rd level comment</p>
                              score: 0
                              sticky: false
                              children:
                              - id: 56b2b226-840d-4189-996c-f2c6cbc86a5b
                                author: Navigator Jack
                                subtitle: 3 hours ago
                                html: <p>4th level comment</p>
                                score: 0
                                sticky: false
                                children:
                                - id: 973c1c1e-bfcd-435c-bb35-ad496dd04d81
                                  author: Anonymous
                                  subtitle: 3 hours ago
                                  html: <p>5th level comment</p>
                                  score: 0
                                  sticky: false
                                  children:
                                  - id: 13b2c933-822c-4308-956a-a1943a64d157
                                    author: Commenter Two
                                    subtitle: 3 hours ago
                                    html: <p>6th level comment</p>
                                    score: 0
                                    sticky: false
                        `,
                },
            ]
                .forEach(pageTest => it(`on page "${pageTest.heading}"`, () => {
                    // Go directly to the page if the user is anonymous
                    if (userTest.user.isAnonymous) {
                        cy.testSiteVisit(pageTest.path);

                    // Login via API otherwise
                    } else {
                        cy.testSiteLoginViaApi(userTest.user, pageTest.path, {verify: pageTest.verifyLogin});
                    }

                    // Verify the headings
                    cy.get('h1').should('have.text', pageTest.heading).and('be.visible');
                    if (pageTest.subheading) {
                        cy.get('h2#comments').should('have.text', 'Comments').and('be.visible');
                    }

                    // Run the post-login routine, if any
                    pageTest.postLogin?.();

                    // Iterate all selectors or use the default
                    (pageTest.rootSelectors || ['comentario-comments'])
                        .forEach(rootSelector => {
                            // Make aliases / check the layout
                            EmbedUtils.makeAliases({rootSelector, anonymous: userTest.user.isAnonymous, ...pageTest.layoutOptions});

                            // Check the comments
                            cy.get(rootSelector).commentTree('id', 'html', 'author', 'subtitle', 'score', 'sticky')
                                .should('yamlMatch', pageTest.comments);
                        });
                }));
        }));

    it('disallows adding comment when no authentication method is available', () => {
        cy.backendReset();

        // Disable all auth methods
        cy.backendPatchDomain(DOMAINS.localhost.id, {authAnonymous: false, authLocal: false, authSso: false});
        cy.backendUpdateDomainIdps(DOMAINS.localhost.id, []);

        // Go to the comments page and verify the layout
        cy.testSiteVisit(TEST_PATHS.comments);
        EmbedUtils.makeAliases({
            anonymous: true,
            login:     false,
            readonly:  true,
            notice:    'This domain has no authentication method available. You cannot add new comments.',
        });
    });
});
