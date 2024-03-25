import { DynConfigItemNamePipe } from './dyn-config-item-name.pipe';

describe('DynConfigItemNamePipe', () => {

    let pipe: DynConfigItemNamePipe;

    beforeEach(() => pipe = new DynConfigItemNamePipe());

    it('is created', () => {
        expect(pipe).toBeTruthy();
    });

    [
        {in: undefined,                                     want: ''},
        {in: null,                                          want: ''},
        {in: '',                                            want: ''},
        {in: 'foo',                                         want: '[foo]'},
        // Instance settings
        {in: 'auth.signup.confirm.commenter',               want: 'New commenters must confirm their email'},
        {in: 'auth.signup.confirm.user',                    want: 'New users must confirm their email'},
        {in: 'auth.signup.enabled',                         want: 'Enable registration of new users'},
        {in: 'domain.defaults.comments.deletion.author',    want: 'Allow comment authors to delete comments'},
        {in: 'domain.defaults.comments.deletion.moderator', want: 'Allow moderators to delete comments'},
        {in: 'domain.defaults.comments.editing.author',     want: 'Allow comment authors to edit comments'},
        {in: 'domain.defaults.comments.editing.moderator',  want: 'Allow moderators to edit comments'},
        {in: 'domain.defaults.comments.enableVoting',       want: 'Enable voting on comments'},
        {in: 'domain.defaults.comments.showDeleted',        want: 'Show deleted comments'},
        {in: 'domain.defaults.signup.enableLocal',          want: 'Enable local commenter registration'},
        {in: 'domain.defaults.signup.enableFederated',      want: 'Enable commenter registration via external provider'},
        {in: 'domain.defaults.signup.enableSso',            want: 'Enable commenter registration via SSO'},
        {in: 'integrations.useGravatar',                    want: 'Use Gravatar for user avatars'},
        {in: 'markdown.images.enabled',                     want: 'Enable images in comments'},
        {in: 'markdown.links.enabled',                      want: 'Enable links in comments'},
        {in: 'markdown.tables.enabled',                     want: 'Enable tables in comments'},
        {in: 'operation.newOwner.enabled',                  want: 'Non-owner users can add domains'},
        // Domain settings
        {in: 'comments.deletion.author',                    want: 'Allow comment authors to delete comments'},
        {in: 'comments.deletion.moderator',                 want: 'Allow moderators to delete comments'},
        {in: 'comments.editing.author',                     want: 'Allow comment authors to edit comments'},
        {in: 'comments.editing.moderator',                  want: 'Allow moderators to edit comments'},
        {in: 'comments.enableVoting',                       want: 'Enable voting on comments'},
        {in: 'comments.showDeleted',                        want: 'Show deleted comments'},
        {in: 'signup.enableLocal',                          want: 'Enable local commenter registration'},
        {in: 'signup.enableFederated',                      want: 'Enable commenter registration via external provider'},
        {in: 'signup.enableSso',                            want: 'Enable commenter registration via SSO'},
    ]
        .forEach(test =>
            it(`transforms '${test.in}' into '${test.want}'`, () =>
                expect(pipe.transform(test.in)).toEqual(test.want)));
});
