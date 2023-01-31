import { HttpClient } from './http-client';
import {
    Comment,
    Commenter,
    CommentMap,
    CommentsGroupedByHex,
    Email,
    SortPolicy,
    SortPolicyProps,
    StringBooleanMap,
} from './models';
import {
    ApiCommentEditResponse,
    ApiCommenterLoginResponse,
    ApiCommenterTokenNewResponse,
    ApiCommentListResponse,
    ApiCommentNewResponse,
    ApiResponseBase,
    ApiSelfResponse,
} from './api';
import { Wrap } from './element-wrap';
import { LoginDialog } from './login-dialog';
import { SignupDialog } from './signup-dialog';
import { UIToolkit } from './ui-toolkit';
import { MarkdownHelp } from './markdown-help';
import { ConfirmDialog } from './confirm-dialog';

const IDS = {
    loginBtn:          'login-btn',
    superContainer:    'textarea-super-container-',
    textarea:          'textarea-',
    anonymousCheckbox: 'anonymous-checkbox-',
    sortPolicy:        'sort-policy-',
    card:              'comment-card-',
    body:              'comment-body-',
    text:              'comment-text-',
    score:             'comment-score-',
    edit:              'comment-edit-',
    reply:             'comment-reply-',
    collapse:          'comment-collapse-',
    upvote:            'comment-upvote-',
    downvote:          'comment-downvote-',
    approve:           'comment-approve-',
    sticky:            'comment-sticky-',
    children:          'comment-children-',
    name:              'comment-name-',
};

export class Comentario {

    /** Origin URL, which gets replaced by the backend on serving the file. */
    private readonly origin = '[[[.Origin]]]';
    /** CDN URL, which gets replaced by the backend on serving the file. */
    private readonly cdn = '[[[.CdnPrefix]]]';
    /** App version, which gets replaced by the backend on serving the file. */
    private readonly version = '[[[.Version]]]';

    /** HTTP client we'll use for API requests. */
    private readonly apiClient = new HttpClient(`${this.origin}/api`);

    /** Default ID of the container element Comentario will be embedded into. */
    private rootId = 'commento';

    /** The root element of Comentario embed. */
    private root: Wrap<any>;

    /** Error message panel (only shown when needed). */
    private error: Wrap<HTMLDivElement>;

    /** Moderator tools panel. */
    private modTools: Wrap<HTMLDivElement>;
    private modToolsLockBtn: Wrap<HTMLButtonElement>;

    /** Main area panel. */
    private mainArea: Wrap<HTMLDivElement>;

    /** Comments panel inside the mainArea. */
    private commentsArea: Wrap<HTMLDivElement>;

    private pageId = parent.location.pathname;
    private cssOverride: string;
    private noFonts = false;
    private hideDeleted = false;
    private autoInit = true;
    private isAuthenticated = false;
    private comments: Comment[] = [];

    /** Loaded comment objects indexed by commentHex. */
    private commentsByHex: CommentMap = {};

    private readonly commenters: { [k: string]: Commenter } = {};
    private requireIdentification = true;
    private isModerator = false;
    private isFrozen = false;
    private chosenAnonymous = false;
    private isLocked = false;
    private stickyCommentHex = 'none';
    private shownReply: StringBooleanMap;
    private readonly shownEdit: StringBooleanMap = {};
    private configuredOauths: StringBooleanMap = {};
    private anonymousOnly = false;
    private sortPolicy: SortPolicy = 'score-desc';
    private selfHex: string = undefined;
    private readonly loadedCss: StringBooleanMap = {};
    private initialised = false;

    private readonly sortingProps: { [k in SortPolicy]: SortPolicyProps<Comment> } = {
        'score-desc':        {label: 'Upvotes', comparator: (a, b) => b.score - a.score},
        'creationdate-desc': {label: 'Newest',  comparator: (a, b) => a.creationMs < b.creationMs ? 1 : -1},
        'creationdate-asc':  {label: 'Oldest',  comparator: (a, b) => a.creationMs < b.creationMs ? -1 : 1},
    };

    constructor(
        private readonly doc: Document,
    ) {
        this.whenDocReady().then(() => this.init());
    }

    /**
     * The main worker routine of Comentario
     * @return Promise that resolves as soon as Comentario setup is complete
     */
    async main(): Promise<void> {
        // Make sure there's a root element present, and save it
        this.root = Wrap.byId(this.rootId, true);
        if (!this.root.ok) {
            return this.reject(`No root element with id='${this.rootId}' found. Check your configuration and HTML.`);
        }

        this.root.classes('root', !this.noFonts && 'root-font');

        // Begin by loading the stylesheet
        await this.cssLoad(`${this.cdn}/css/commento.css`);

        // Load stylesheet override, if any
        if (this.cssOverride) {
            await this.cssLoad(this.cssOverride);
        }

        // Load the UI
        await this.reload();

        // Scroll to the requested comment, if any
        this.scrollToCommentHash();
    }

    /**
     * Return a rejected promise with the given message.
     * @param message Message to reject the promise with.
     * @private
     */
    private reject(message: string): Promise<never> {
        return Promise.reject(`Comentario: ${message}`);
    }

    /**
     * Returns a promise that gets resolved as soon as the document reaches at least its 'interactive' state.
     * @private
     */
    private whenDocReady(): Promise<void> {
        return new Promise(resolved => {
            const checkState = () => {
                switch (this.doc.readyState) {
                    // The document is still loading. The div we need to fill might not have been parsed yet, so let's
                    // wait and retry when the readyState changes
                    case 'loading':
                        this.doc.addEventListener('readystatechange', () => checkState());
                        break;

                    case 'interactive': // The document has been parsed and DOM objects are now accessible.
                    case 'complete': // The page has fully loaded (including JS, CSS, and images)
                        resolved();
                }
            };
            checkState();
        });
    }

    /**
     * Initialise the Comentario engine on the current page.
     * @private
     */
    private async init(): Promise<void> {
        // Only perform initialisation once
        if (this.initialised) {
            return this.reject('Already initialised, ignoring the repeated init call');
        }
        this.initialised = true;

        // Parse any custom data-* tags on the Comentario script element
        this.dataTagsLoad();

        // If automatic initialisation is activated (default), run Comentario
        if (this.autoInit) {
            await this.main();
        }
        console.info(`Initialised Comentario ${this.version}`);
    }

    cookieGet(name: string): string {
        const c = `; ${this.doc.cookie}`;
        const x = c.split(`; ${name}=`);
        return x.length === 2 ? x.pop().split(';').shift() : null;
    }

    cookieSet(name: string, value: string) {
        const date = new Date();
        date.setTime(date.getTime() + (365 * 24 * 60 * 60 * 1000));
        this.doc.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
    }

    commenterTokenGet() {
        const commenterToken = this.cookieGet('commentoCommenterToken');
        return commenterToken === undefined ? 'anonymous' : commenterToken;
    }

    /**
     * Load the stylesheet with the provided URL into the DOM
     * @param url Stylesheet URL.
     */
    cssLoad(url: string): Promise<void> {
        // Don't bother if the stylesheet has been loaded already
        return this.loadedCss[url] ?
            Promise.resolve() :
            new Promise(resolve => {
                this.loadedCss[url] = true;
                new Wrap(this.doc.getElementsByTagName('head')[0])
                    .append(
                        Wrap.new('link').attr({href: url, rel: 'stylesheet', type: 'text/css'}).on('load', () => resolve()));
            });
    }

    /**
     * Create a new editor for editing comment text.
     * @param commentHex Comment's hex ID.
     * @param isEdit Whether it's adding a new comment (false) or editing an existing one (true)
     */
    textareaCreate(commentHex: string, isEdit: boolean): Wrap<HTMLFormElement> {
        // "Comment anonymously" checkbox
        let anonContainer: Wrap<any>;
        if (!this.requireIdentification && !isEdit) {
            const anonCheckbox = Wrap.new('input').id(IDS.anonymousCheckbox + commentHex).attr({type: 'checkbox'});
            if (this.anonymousOnly) {
                anonCheckbox.checked(true).attr({disabled: 'true'});
            }
            anonContainer = Wrap.new('div')
                .classes('round-check', 'anonymous-checkbox-container')
                .append(
                    anonCheckbox,
                    Wrap.new('label').attr({for: Wrap.idPrefix + IDS.anonymousCheckbox + commentHex}).inner('Comment anonymously'));
        }

        // Instantiate and set up a new form
        return UIToolkit.form(() => isEdit ? this.saveCommentEdits(commentHex) : this.submitAccountDecide(commentHex))
            .id(IDS.superContainer + commentHex)
            .classes('textarea-form')
            .append(
                // Textarea in a container
                Wrap.new('div')
                    .classes('textarea-container')
                    .append(
                        Wrap.new('textarea').id(IDS.textarea + commentHex).attr({placeholder: 'Add a comment'}).autoExpand()),
                // Textarea footer
                Wrap.new('div')
                    .classes('textarea-form-footer')
                    .append(
                        Wrap.new('div')
                            .append(
                                // Anonymous checkbox, if any
                                anonContainer,
                                // Markdown help button
                                UIToolkit.button(
                                    '<b>M⬇</b>&nbsp;Markdown',
                                    btn => MarkdownHelp.run(this.root, {ref: btn, placement: 'bottom-start'}),
                                    'markdown-button')),
                        // Submit button
                        UIToolkit.submit(isEdit ? 'Save Changes' : 'Add Comment', false)));
    }

    sortPolicyApply(policy: SortPolicy) {
        Wrap.byId(IDS.sortPolicy + this.sortPolicy).noClasses('sort-policy-button-selected');
        Wrap.byId(IDS.sortPolicy + policy).classes('sort-policy-button-selected');
        this.sortPolicy = policy;

        // Re-render the sorted comment
        this.commentsRender();
    }

    sortPolicyBox(): Wrap<HTMLDivElement> {
        const container = Wrap.new('div').classes('sort-policy-buttons-container');
        const buttonBar = Wrap.new('div').classes('sort-policy-buttons').appendTo(container);
        Object.keys(this.sortingProps).forEach((sp: SortPolicy) =>
            Wrap.new('a')
                .id(IDS.sortPolicy + sp)
                .classes('sort-policy-button', sp === this.sortPolicy && 'sort-policy-button-selected')
                .inner(this.sortingProps[sp].label)
                .appendTo(buttonBar)
                .click(() => this.sortPolicyApply(sp)));
        return container;
    }

    messageCreate(text: string): Wrap<HTMLDivElement> {
        return Wrap.new('div').classes('moderation-notice').inner(text);
    }

    colorGet(name: string) {
        const colors = [
            '#396ab1',
            '#da7c30',
            '#3e9651',
            '#cc2529',
            '#922428',
            '#6b4c9a',
            '#535154',
        ];

        let total = 0;
        for (let i = 0; i < name.length; i++) {
            total += name.charCodeAt(i);
        }
        return colors[total % colors.length];
    }

    timeDifference(current: number, previous: number): string {
        // Times are defined in milliseconds
        const msPerSecond = 1000;
        const msPerMinute = 60 * msPerSecond;
        const msPerHour = 60 * msPerMinute;
        const msPerDay = 24 * msPerHour;
        const msPerMonth = 30 * msPerDay;
        const msPerYear = 12 * msPerMonth;

        // Time ago thresholds
        const msJustNow = 5 * msPerSecond; // Up until 5 s
        const msMinutesAgo = 2 * msPerMinute; // Up until 2 minutes
        const msHoursAgo = 2 * msPerHour; // Up until 2 hours
        const msDaysAgo = 2 * msPerDay; // Up until 2 days
        const msMonthsAgo = 2 * msPerMonth; // Up until 2 months
        const msYearsAgo = 2 * msPerYear; // Up until 2 years

        const elapsed = current - previous;

        if (elapsed < msJustNow) {
            return 'just now';
        } else if (elapsed < msMinutesAgo) {
            return `${Math.round(elapsed / msPerSecond)} seconds ago`;
        } else if (elapsed < msHoursAgo) {
            return `${Math.round(elapsed / msPerMinute)} minutes ago`;
        } else if (elapsed < msDaysAgo) {
            return `${Math.round(elapsed / msPerHour)} hours ago`;
        } else if (elapsed < msMonthsAgo) {
            return `${Math.round(elapsed / msPerDay)} days ago`;
        } else if (elapsed < msYearsAgo) {
            return `${Math.round(elapsed / msPerMonth)} months ago`;
        } else {
            return `${Math.round(elapsed / msPerYear)} years ago`;
        }
    }

    scorify(score: number) {
        return score === 1 ? 'One point' : `${score} points`;
    }

    commentsRecurse(parentMap: CommentsGroupedByHex, parentHex: string): Wrap<any> {
        // Fetch comments that have the given parentHex
        const comments = parentMap[parentHex];

        // Return an empty wrap if there's none
        if (!comments?.length) {
            return new Wrap();
        }

        // Apply the chosen sorting, always keeping the sticky comment on top
        comments.sort((a, b) =>
            !a.deleted && a.commentHex === this.stickyCommentHex ?
                -Infinity :
                !b.deleted && b.commentHex === this.stickyCommentHex ?
                    Infinity :
                    this.sortingProps[this.sortPolicy].comparator(a, b));

        const curTime = (new Date()).getTime();
        const cards = Wrap.new('div');
        comments.forEach(comment => {
            const commenter = this.commenters[comment.commenterHex];
            const commLink = !commenter.link || commenter.link === 'undefined' || commenter.link === 'https://undefined' ? undefined : commenter.link;
            const hex = comment.commentHex;
            const color = this.colorGet(`${comment.commenterHex}-${commenter.name}`);
            const children = this.commentsRecurse(parentMap, hex).id(IDS.children + hex).classes('body');
            const card = Wrap.new('div')
                .id(IDS.card + hex)
                .style(`border-left: 2px solid ${color}`)
                .classes('card', this.isModerator && comment.state !== 'approved' && 'dark-card')
                .append(
                    // Card header
                    Wrap.new('div')
                        .classes('header')
                        .append(
                            // Options toolbar
                            this.getCommentOptions(comment, hex, parentHex),
                            // Avatar
                            commenter.photo === 'undefined' ?
                                Wrap.new('div')
                                    .style(`background-color: ${color}`)
                                    .classes('avatar')
                                    .html(comment.commenterHex === 'anonymous' ? '?' : commenter.name[0].toUpperCase()) :
                                Wrap.new('img')
                                    .classes('avatar-img')
                                    .attr({src: `${this.cdn}/api/commenter/photo?commenterHex=${commenter.commenterHex}`, alt: ''}),
                            // Name
                            Wrap.new(commLink ? 'a' : 'div')
                                .id(IDS.name + hex)
                                .inner(comment.deleted ? '[deleted]' : commenter.name)
                                .classes(
                                    'name',
                                    commenter.isModerator && 'moderator',
                                    comment.state === 'flagged' && 'flagged')
                                .attr({href: commLink, rel: 'nofollow noopener noreferrer'}),
                            // Subtitle
                            Wrap.new('div')
                                .classes('subtitle')
                                .append(
                                    // Score
                                    Wrap.new('div').id(IDS.score + hex).classes('score').inner(this.scorify(comment.score)),
                                    // Time ago
                                    Wrap.new('div')
                                        .classes('timeago')
                                        .inner(this.timeDifference(curTime, comment.creationMs))
                                        .attr({title: comment.creationDate.toString()}))),
                    // Card contents
                    Wrap.new('div')
                        .append(
                            Wrap.new('div').id(IDS.body + hex).classes('body')
                                .append(Wrap.new('div').id(IDS.text + hex).html(comment.html)),
                            children));

            if (!comment.deleted || !this.hideDeleted && !children.ok) {
                cards.append(card);
            }
        });

        // If no cards found, return an empty wrap
        return cards.hasChildren ? cards : new Wrap();
    }

    /**
     * Return a wrapped options toolbar for a comment.
     * @private
     */
    private getCommentOptions(comment: Comment, hex: string, parentHex: string): Wrap<any> {
        const options = Wrap.new('div').classes('options');

        // Sticky comment indicator (for non-moderator only)
        const isSticky = this.stickyCommentHex === hex;
        if (!comment.deleted && !this.isModerator && isSticky) {
            Wrap.new('button')
                .id(IDS.sticky + hex)
                .classes('option-button', 'option-sticky')
                .attr({title: 'This comment has been stickied', type: 'button', disabled: 'true'})
                .appendTo(options);
        }

        // Approve button
        if (this.isModerator && comment.state !== 'approved') {
            Wrap.new('button')
                .id(IDS.approve + hex)
                .classes('option-button', 'option-approve')
                .attr({type: 'button', title: 'Approve'})
                .click(() => this.commentApprove(hex))
                .appendTo(options);
        }

        // Remove button
        if (!comment.deleted && (this.isModerator || comment.commenterHex === this.selfHex)) {
            Wrap.new('button')
                .classes('option-button', 'option-remove')
                .attr({type: 'button', title: 'Remove'})
                .click(btn => this.commentDelete(btn, hex))
                .appendTo(options);
        }

        // Sticky toggle button (for moderator and a top-level comments only)
        if (!comment.deleted && this.isModerator && parentHex === 'root') {
            Wrap.new('button')
                .id(IDS.sticky + hex)
                .classes('option-button', isSticky ? 'option-unsticky' : 'option-sticky')
                .attr({title: isSticky ? 'Unsticky' : 'Sticky', type: 'button'})
                .click(() => this.commentSticky(hex))
                .appendTo(options);
        }

        // Own comment: Edit button
        if (comment.commenterHex === this.selfHex) {
            Wrap.new('button')
                .id(IDS.edit + hex)
                .classes('option-button', 'option-edit')
                .attr({type: 'button', title: 'Edit'})
                .click(() => this.startEditing(hex))
                .appendTo(options);

        // Someone other's comment: Reply button
        } else if (!comment.deleted) {
            Wrap.new('button')
                .id(IDS.reply + hex)
                .classes('option-button', 'option-reply')
                .attr({type: 'button', title: 'Reply'})
                .click(() => this.replyShow(hex))
                .appendTo(options);
        }

        // Upvote / Downvote buttons
        if (!comment.deleted) {
            this.updateUpDownAction(
                Wrap.new('button')
                    .id(IDS.upvote + hex)
                    .classes('option-button', 'option-upvote', this.isAuthenticated && comment.direction > 0 && 'upvoted')
                    .attr({type: 'button', title: 'Upvote'})
                    .appendTo(options),
                Wrap.new('button')
                    .id(IDS.downvote + hex)
                    .classes('option-button', 'option-downvote', this.isAuthenticated && comment.direction < 0 && 'downvoted')
                    .attr({type: 'button', title: 'Downvote'})
                    .appendTo(options),
                hex,
                comment.direction);
        }

        // Collapse button
        Wrap.new('button')
            .id(IDS.collapse + hex)
            .classes('option-button', 'option-collapse')
            .attr({type: 'button', title: 'Collapse children'})
            .click(() => this.commentCollapse(hex))
            .appendTo(options);
        return options;
    }

    updateUpDownAction(upvote: Wrap<any>, downvote: Wrap<any>, commentHex: string, direction: number) {
        let oldDir = 0, du = 1, dd = -1;
        if (direction > 0) {
            oldDir = 1;
            du = 0;
            dd = -1;
        } else if (direction < 0) {
            oldDir = -1;
            du = 1;
            dd = 0;
        }
        upvote  .unlisten().click(() => this.isAuthenticated ? this.vote(commentHex, oldDir, du) : this.showLoginDialog(null));
        downvote.unlisten().click(() => this.isAuthenticated ? this.vote(commentHex, oldDir, dd) : this.showLoginDialog(null));
    }

    /**
     * Create a new editor for editing a comment with the given hex ID.
     * @param commentHex Comment's hex ID.
     */
    startEditing(commentHex: string) {
        if (this.shownEdit[commentHex]) {
            return;
        }

        this.shownEdit[commentHex] = true;
        Wrap.byId(IDS.text + commentHex).replaceWith(this.textareaCreate(commentHex, true));
        Wrap.byId(IDS.textarea + commentHex).value(this.commentsByHex[commentHex].markdown);

        // Turn the Edit button into a Cancel edit button
        Wrap.byId(IDS.edit + commentHex)
            .noClasses('option-edit')
            .classes('option-cancel')
            .attr({title: 'Cancel edit'})
            .unlisten()
            .click(() => this.stopEditing(commentHex));
    }

    /**
     * Close the created editor for editing a comment with the given hex ID, cancelling the edits.
     * @param commentHex Comment's hex ID.
     */
    stopEditing(commentHex: string) {
        delete this.shownEdit[commentHex];
        Wrap.byId(IDS.superContainer + commentHex)
            .html(this.commentsByHex[commentHex].html)
            .id(IDS.text + commentHex);

        // Turn the Cancel edit button back into the Edit button
        Wrap.byId(IDS.edit + commentHex)
            .noClasses('option-cancel')
            .classes('option-edit')
            .attr({title: 'Edit comment'})
            .unlisten()
            .click(() => this.startEditing(commentHex));
    }

    /**
     * Create a new editor for editing a reply to the comment with the given hex ID.
     * @param commentHex Comment's hex ID.
     */
    replyShow(commentHex: string) {
        // Don't bother if there's an editor already
        if (this.shownReply[commentHex]) {
            return;
        }

        this.shownReply[commentHex] = true;
        this.textareaCreate(commentHex, false).insertAfter(Wrap.byId(IDS.text + commentHex));
        Wrap.byId(IDS.reply + commentHex)
            .noClasses('option-reply')
            .classes('option-cancel')
            .attr({title: 'Cancel reply'})
            .unlisten()
            .click(() => this.replyCollapse(commentHex));
    }

    /**
     * Close the created editor for editing a reply to the comment with the given hex ID.
     * @param commentHex Comment's hex ID.
     */
    replyCollapse(commentHex: string) {
        delete this.shownReply[commentHex];
        Wrap.byId(IDS.superContainer + commentHex).remove();
        Wrap.byId(IDS.reply + commentHex)
            .noClasses('option-cancel')
            .classes('option-reply')
            .attr({title: 'Reply to this comment'})
            .unlisten()
            .click(() => this.replyShow(commentHex));
    }

    commentCollapse(commentHex: string) {
        Wrap.byId(IDS.children + commentHex).classes('hidden');
        Wrap.byId(IDS.collapse + commentHex)
            .noClasses('option-collapse')
            .classes('option-uncollapse')
            .attr({title: 'Expand children'})
            .unlisten()
            .click(() => this.commentUncollapse(commentHex));
    }

    commentUncollapse(commentHex: string) {
        Wrap.byId(IDS.children + commentHex).noClasses('hidden');
        Wrap.byId(IDS.collapse + commentHex)
            .noClasses('option-uncollapse')
            .classes('option-collapse')
            .attr({title: 'Collapse children'})
            .unlisten()
            .click(() => this.commentCollapse(commentHex));
    }

    commentsRender() {
        // Group comments by parent hex ID: make map {parentHex: Comment[]}
        const parentMap = this.comments.reduce(
            (m, c) => {
                const ph = c.parentHex;
                if (ph in m) {
                    m[ph].push(c);
                } else {
                    m[ph] = [c];
                }
                return m;
            },
            {} as CommentsGroupedByHex);

        // Re-render the comment recursively and add them to the comments area
        this.commentsArea
            .html('')
            .append(this.commentsRecurse(parentMap, 'root'));
    }

    submitAuthenticated(commentHex: string): Promise<void> {
        if (this.isAuthenticated) {
            return this.commentNew(commentHex, this.commenterTokenGet(), true);
        }

        return this.showLoginDialog(commentHex);
    }

    submitAnonymous(commentHex: string): Promise<void> {
        this.chosenAnonymous = true;
        return this.commentNew(commentHex, 'anonymous', true);
    }

    submitAccountDecide(commentHex: string): Promise<void> {
        if (this.requireIdentification) {
            return this.submitAuthenticated(commentHex);
        }

        const anonCheckbox = Wrap.byId(IDS.anonymousCheckbox + commentHex);
        const textarea = Wrap.byId(IDS.textarea + commentHex);
        if (!textarea.val?.trim()) {
            textarea.classes('red-border');
            return Promise.reject();
        }

        textarea.noClasses('red-border');
        return anonCheckbox.isChecked ? this.submitAnonymous(commentHex) : this.submitAuthenticated(commentHex);
    }

    forgotPassword() {
        window.open(`${this.origin}/forgot?commenter=true`, '_blank');
    }

    dataTagsLoad() {
        for (const script of this.doc.getElementsByTagName('script')) {
            if (script.src.match(/\/js\/commento\.js$/)) {
                const ws = new Wrap(script);
                let s = ws.getAttr('data-page-id');
                if (s) {
                    this.pageId = s;
                }
                this.cssOverride = ws.getAttr('data-css-override');
                this.autoInit = ws.getAttr('data-auto-init') !== 'false';
                s = ws.getAttr('data-id-root');
                if (s) {
                    this.rootId = s;
                }
                this.noFonts = ws.getAttr('data-no-fonts') === 'true';
                this.hideDeleted = ws.getAttr('data-hide-deleted') === 'true';
                break;
            }
        }
    }

    /**
     * Scroll to the comment whose hex ID is provided in the current window's fragment (if any).
     * @private
     */
    private scrollToCommentHash() {
        const h = window.location.hash;

        // If the hash starts with a valid hex ID
        if (h?.startsWith('#commento-')) {
            const id = h.substring(10);
            Wrap.byId(IDS.card + id)
                .classes('highlighted-card')
                .scrollTo()
                .else(() => {
                    // Make sure it's a (sort of) valid ID before showing the user a message
                    if (id.length === 64) {
                        this.setError('The comment you\'re looking for doesn\'t exist; possibly it was deleted.');
                    }
                });


        } else if (h?.startsWith('#commento')) {
            // If we're requested to scroll to the comments in general
            this.root.scrollTo();
        }
    }

    /**
     * Set and display (message is given) or clean (message is falsy) an error message in the error panel.
     * @param message Message to set. If falsy, the error panel gets removed.
     * @return Whether there was a (truthy) error.
     * @private
     */
    private setError(message?: string): boolean {
        if (message) {
            this.error = (this.error || Wrap.new('div').classes('error-box').prependTo(this.root)).inner(message);
            return true;
        }
        this.error?.remove();
        this.error = undefined;
        return false;
    }

    /**
     * Request the authentication status of the current user from the backend, and return a promise that resolves as
     * soon as the status becomes definite.
     * @private
     */
    private async getAuthStatus(): Promise<void> {
        this.isAuthenticated = false;

        // If we're already (knowingly) anonymous
        if (this.commenterTokenGet() !== 'anonymous') {
            // Fetch the status from the backend
            try {
                const r = await this.apiClient.post<ApiSelfResponse>('commenter/self', {commenterToken: this.commenterTokenGet()});
                if (!r.success) {
                    this.cookieSet('commentoCommenterToken', 'anonymous');
                } else {
                    this.setupCurUserProfile(r.commenter, r.email);
                    this.isAuthenticated = true;
                }
            } catch (e) {
                // On any error consider the user unauthenticated
                console.error(e);
            }
        }
    }

    /**
     * Reload the app UI.
     */
    private async reload() {
        // Remove any content from the root
        this.root.html('');
        this.modTools = null;
        this.modToolsLockBtn = null;
        this.mainArea = null;
        this.commentsArea = null;
        this.shownReply = {};

        // Load information about ourselves
        await this.getAuthStatus();

        // Fetch page data and comments
        await this.loadPageData();

        // Create the layout
        this.root.append(
            // Moderator toolbar
            this.isModerator && this.createModToolsPanel(),
            // Main area
            this.createMainArea(),
            // Footer
            this.createFooter(),
        );

        // Render the comments
        this.commentsRender();
    }

    /**
     * Create and return a moderator toolbar element.
     * @private
     */
    private createModToolsPanel(): Wrap<HTMLDivElement> {
        this.modToolsLockBtn = UIToolkit.button(
            this.isLocked ? 'Unlock Thread' : 'Lock Thread',
            () => this.threadLockToggle());
        this.modTools = Wrap.new('div')
            .classes('mod-tools')
            .append(Wrap.new('span').classes('mod-tools-title').inner('Moderator tools'), this.modToolsLockBtn)
            .appendTo(this.root);
        return this.modTools;
    }

    /**
     * Create and return a main area element.
     * @private
     */
    private createMainArea(): Wrap<HTMLDivElement> {
        this.mainArea = Wrap.new('div').classes('main-area');

        // If there's any auth provider configured
        if (Object.values(this.configuredOauths).some(b => b)) {
            // If not authenticated, add a Login button
            if (!this.isAuthenticated) {
                Wrap.new('div')
                    .classes('login')
                    .append(UIToolkit.button('Login', () => this.showLoginDialog(null)).id(IDS.loginBtn))
                    .appendTo(this.mainArea);
            }

        } else if (!this.requireIdentification) {
            // No auth provider available, but we allow anonymous commenting
            this.anonymousOnly = true;
        }

        // If commenting is locked/frozen, add a corresponding message
        if (this.isLocked || this.isFrozen) {
            if (this.isAuthenticated || this.chosenAnonymous) {
                this.mainArea.append(this.messageCreate('This thread is locked. You cannot add new comments.'));
            }

        // Otherwise, add a root editor (for creating a new comment)
        } else {
            this.mainArea.append(this.textareaCreate('root', false));
        }

        // If there's any comment, add sort buttons
        if (this.comments.length) {
            this.mainArea.append(this.sortPolicyBox());
        }

        // Create a panel for comments
        this.commentsArea = Wrap.new('div').classes('comments').appendTo(this.mainArea);
        return this.mainArea;
    }

    /**
     * Create and return a footer panel.
     * @private
     */
    private createFooter(): Wrap<HTMLDivElement> {
        return Wrap.new('div')
            .classes('footer')
            .append(
                Wrap.new('div')
                    .classes('logo-container')
                    .append(
                        Wrap.new('a')
                            .attr({href: 'https://comentario.app/', target: '_blank'})
                            .html('Powered by ')
                            .append(
                                Wrap.new('span').classes('logo'),
                                Wrap.new('span').classes('logo-brand').inner('Comentario'))));
    }

    /**
     * Only called when there's an authenticated user. Sets up the controls related to the current user.
     * @param commenter Currently authenticated user.
     * @param email Email of the commenter.
     * @private
     */
    private setupCurUserProfile(commenter: Commenter, email: Email) {
        this.commenters[commenter.commenterHex] = commenter;
        this.selfHex = commenter.commenterHex;

        // Create an avatar element
        const color = this.colorGet(`${commenter.commenterHex}-${commenter.name}`);
        const avatar = commenter.photo === 'undefined' ?
            Wrap.new('div')
                .classes('avatar')
                .html(commenter.name[0].toUpperCase())
                .style(`background-color: ${color}`) :
            Wrap.new('img')
                .classes('avatar-img')
                .attr({src: `${this.cdn}/api/commenter/photo?commenterHex=${commenter.commenterHex}`, loading: 'lazy', alt: ''});

        // Create a profile bar
        const link = !commenter.link || commenter.link === 'undefined' ? undefined : commenter.link;
        Wrap.new('div')
            .classes('profile-bar')
            .append(
                // Commenter avatar and name
                Wrap.new('div')
                    .classes('logged-in-as')
                    .append(
                        // Avatar
                        avatar,
                        // Name and link
                        Wrap.new(link ? 'a' : 'div').classes('name').inner(commenter.name).attr({href: link, rel: 'nofollow noopener noreferrer'})),
                // Buttons on the right
                Wrap.new('div')
                    .append(
                        // If it's a local user, add an Edit profile link
                        commenter.provider === 'commento' &&
                            Wrap.new('a')
                                .classes('profile-link')
                                .inner('Edit profile')
                                .attr({href: `${this.origin}/profile?commenterToken=${this.commenterTokenGet()}`, target: '_blank'}),
                        // Notification settings link
                        Wrap.new('a')
                            .classes('profile-link')
                            .inner('Notification settings')
                            .attr({href: `${this.origin}/unsubscribe?unsubscribeSecretHex=${email.unsubscribeSecretHex}`, target: '_blank'}),
                        // Logout link
                        Wrap.new('a')
                            .classes('profile-link')
                            .inner('Logout')
                            .attr({href: ''})
                            .click((_, e) => this.logout(e))))
            .prependTo(this.root);
    }

    /**
     * Register the user with the given details and log them in.
     * @param name User's full name.
     * @param website User's website.
     * @param email User's email.
     * @param password User's password.
     * @param commentHex Optional comment hex ID to add.
     */
    private async signup(name: string, website: string, email: string, password: string, commentHex: string): Promise<void> {
        // Sign the user up
        const r = await this.apiClient.post<ApiResponseBase>('commenter/new', {name, website, email, password});
        if (this.setError(!r.success && r.message)) {
            return Promise.reject();
        }

        // Log the user in, submitting their comment (if any)
        return this.authenticateLocally(email, password, commentHex);
    }

    /**
     * Authenticate the user using local authentication (email and password).
     * @param email User's email.
     * @param password User's password.
     * @param commentHex Optional comment hex ID to add.
     */
    private async authenticateLocally(email: string, password: string, commentHex: string): Promise<void> {
        // Log the user in
        const r = await this.apiClient.post<ApiCommenterLoginResponse>('commenter/login', {email, password});
        if (this.setError(!r.success && r.message)) {
            return Promise.reject();
        }

        // Store the authenticated token in a cookie
        this.cookieSet('commentoCommenterToken', r.commenterToken);

        // Submit a new comment, if needed
        if (commentHex) {
            await this.commentNew(commentHex, r.commenterToken, false);
        }

        // Reload the whole bunch
        return this.reload();
    }

    /**
     * Show the signup dialog.
     * @param commentHex Optional comment hex ID to add upon signup.
     * @private
     */
    private async showSignupDialog(commentHex: string): Promise<void> {
        const dlg = await SignupDialog.run(
            this.root,
            {ref: Wrap.byId(IDS.loginBtn), placement: 'bottom-end'});
        return dlg.confirmed && await this.signup(dlg.name, dlg.website, dlg.email, dlg.password, commentHex);
    }

    /**
     * Show the login dialog.
     * @param commentHex Optional comment hex ID to add upon login.
     * @private
     */
    private async showLoginDialog(commentHex: string): Promise<void> {
        const dlg = await LoginDialog.run(
            this.root,
            {ref: Wrap.byId(IDS.loginBtn), placement: 'bottom-end'},
            this.configuredOauths);
        if (dlg.confirmed) {
            switch (dlg.navigateTo) {
                case null:
                    // Local auth
                    return await this.authenticateLocally(dlg.email, dlg.password, commentHex);

                case 'forgot':
                    // Navigate to forgot password
                    return this.forgotPassword();

                case 'signup':
                    // Switch to signup
                    return await this.showSignupDialog(commentHex);

                default:
                    // External auth
                    return await this.openOAuthPopup(dlg.navigateTo, commentHex);
            }
        }
    }

    /**
     * Open a new browser popup window for authenticating with the given identity provider.
     * @param idp Identity provider to initiate authentication with.
     * @param commentHex Optional hex ID of the comment to add upon successful authentication.
     * @private
     */
    private async openOAuthPopup(idp: string, commentHex: string): Promise<void> {
        // Request a token
        const r = await this.apiClient.get<ApiCommenterTokenNewResponse>('commenter/token/new');
        if (this.setError(!r.success && r.message)) {
            return this.reject(r.message);
        }

        // Store the obtained auth token
        this.cookieSet('commentoCommenterToken', r.commenterToken);

        // Open a popup window
        const popup = window.open(
            `${this.origin}/api/oauth/${idp}/redirect?commenterToken=${r.commenterToken}`,
            '_blank',
            'popup,width=800,height=600');

        // Wait until the popup is closed
        await new Promise<void>(resolve => {
            const interval = setInterval(
                () => {
                    if (popup.closed) {
                        clearInterval(interval);
                        resolve();
                    }
                },
                500);
        });

        // Refresh the auth status
        await this.getAuthStatus();

        // Submit the pending comment, if there was one
        if (this.isAuthenticated && commentHex) {
            await this.commentNew(commentHex, this.commenterTokenGet(), false);
        }

        // Reload the whole bunch
        return this.reload();
    }

    /**
     * Log the current user out.
     * @param e Click event that triggered the logout.
     * @private
     */
    private logout(e: MouseEvent): Promise<void> {
        e.preventDefault();
        this.cookieSet('commentoCommenterToken', 'anonymous');
        this.isAuthenticated = false;
        this.isModerator = false;
        this.selfHex = undefined;
        return this.reload();
    }

    /**
     * Load data for the current page URL, including the comments, from the backend and store them locally
     * @private
     */
    private async loadPageData(): Promise<void> {
        // Retrieve a comment list from the backend
        const r = await this.apiClient.post<ApiCommentListResponse>('comment/list', {
            commenterToken: this.commenterTokenGet(),
            domain:         parent.location.host,
            path:           this.pageId,
        });
        if (this.setError(!r.success && r.message)) {
            return;
        }

        // Store all known commenters
        Object.assign(this.commenters, r.commenters);

        // Store page- and backend-related properties
        this.requireIdentification = r.requireIdentification;
        this.isModerator           = r.isModerator;
        this.isFrozen              = r.isFrozen;
        this.isLocked              = r.attributes.isLocked;
        this.stickyCommentHex      = r.attributes.stickyCommentHex;
        this.configuredOauths      = r.configuredOauths;
        this.sortPolicy            = r.defaultSortPolicy;

        // Update comment models and make a hex-comment map
        this.comments = r.comments;
        this.commentsByHex = {};
        this.comments.forEach(c => {
            c.creationMs = new Date(c.creationDate).getTime();
            this.commentsByHex[c.commentHex] = c;
        });
    }

    /**
     * Submit a new comment entered under the given hex ID.
     * @param commentHex Comment's hex ID.
     * @param commenterToken Token of the current commenter.
     * @param appendCard Whether to also add a new card for the created comment.
     * @private
     */
    private async commentNew(commentHex: string, commenterToken: string, appendCard: boolean): Promise<void> {
        const container = Wrap.byId(IDS.superContainer + commentHex);
        const textarea  = Wrap.byId(IDS.textarea + commentHex);

        // Validate the textarea value
        const markdown = textarea.val;
        if (markdown === '') {
            textarea.classes('red-border');
            return Promise.reject();
        }
        textarea.noClasses('red-border');

        // Submit the comment to the backend
        const r = await this.apiClient.post<ApiCommentNewResponse>('comment/new', {
            commenterToken,
            domain: parent.location.host,
            path: this.pageId,
            parentHex: commentHex,
            markdown,
        });
        if (this.setError(!r.success && r.message)) {
            return;
        }

        // Update the comment's moderation notice
        this.updateCommentModerationNotice(commentHex, r.state);

        // Store the updated comment in the local map
        const comment: Comment = {
            commentHex:   r.commentHex,
            commenterHex: this.selfHex === undefined || commenterToken === 'anonymous' ? 'anonymous' : this.selfHex,
            markdown,
            html:         r.html,
            parentHex:    'root',
            score:        0,
            state:        'approved',
            direction:    0,
            creationDate: new Date().toISOString(),
            deleted:      false,
        };
        this.commentsByHex[r.commentHex] = comment;

        // Add the new card, if needed
        if (appendCard) {
            const newCard = this.commentsRecurse({root: [comment]}, 'root');
            if (commentHex !== 'root') {
                container.replaceWith(newCard);

                this.shownReply[commentHex] = false;
                Wrap.byId(IDS.reply + commentHex)
                    .noClasses('option-cancel')
                    .classes('option-reply')
                    .attr({title: 'Reply to this comment'})
                    .click(() => this.replyShow(commentHex));
            } else {
                textarea.value('');
                newCard.prependTo(this.commentsArea);
            }
        } else if (commentHex === 'root') {
            textarea.value('');
        }
    }

    /**
     * Submit the entered comment markdown to the backend for saving.
     * @param commentHex Comment's hex ID
     */
    private async saveCommentEdits(commentHex: string): Promise<void> {
        const textarea = Wrap.byId(IDS.textarea + commentHex);

        // Validate the textarea value
        const markdown = textarea.val.trim();
        if (markdown === '') {
            textarea.classes('red-border');
            return Promise.reject();
        }
        textarea.noClasses('red-border');

        // Submit the edit to the backend
        const r = await this.apiClient.post<ApiCommentEditResponse>('comment/edit', {
            commenterToken: this.commenterTokenGet(),
            commentHex,
            markdown});
        if (this.setError(!r.success && r.message)) {
            return;
        }

        // Update the locally stored comment's data
        this.commentsByHex[commentHex].markdown = markdown;
        this.commentsByHex[commentHex].html = r.html;

        // Hide the editor
        this.stopEditing(commentHex);

        // Update the comment's moderation notice
        this.updateCommentModerationNotice(commentHex, r.state);
    }

    /**
     * Add the relevant moderation notice to the given comment, if needed.
     * @param commentHex Comment's hex ID.
     * @param state Comment's moderation state.
     * @private
     */
    private updateCommentModerationNotice(commentHex: string, state: 'unapproved' | 'flagged') {
        let message = '';
        switch (state) {
            case 'unapproved':
                message = 'Your comment is under moderation.';
                break;
            case 'flagged':
                message = 'Your comment was flagged as spam and is under moderation.';
                break;
            default:
                return;
        }
        this.messageCreate(message).prependTo(Wrap.byId(IDS.superContainer + commentHex));
    }

    /**
     * Toggle the current comment's thread lock status.
     * @private
     */
    private async threadLockToggle(): Promise<void> {
        this.modToolsLockBtn.attr({disabled: 'true'});
        this.isLocked = !this.isLocked;
        await this.submitPageAttrs();
        this.modToolsLockBtn.attr({disabled: 'false'});
        return this.reload();
    }

    /**
     * Approve the comment with the given hex ID.
     * @param commentHex Comment's hex ID.
     * @private
     */
    private async commentApprove(commentHex: string): Promise<void> {
        // Submit the approval to the backend
        const r = await this.apiClient.post<ApiResponseBase>(
            'comment/approve',
            {commenterToken: this.commenterTokenGet(), commentHex});
        if (this.setError(!r.success && r.message)) {
            return;
        }

        // Update the styling of the comment
        Wrap.byId(IDS.card + commentHex).noClasses('dark-card');
        Wrap.byId(IDS.name + commentHex).noClasses('flagged');
        Wrap.byId(IDS.approve + commentHex).remove();
    }

    /**
     * Delete the comment with the given hex ID.
     * @param btn Button element that triggered deletion (for popup positioning).
     * @param commentHex Comment's hex ID.
     * @private
     */
    private async commentDelete(btn: Wrap<any>, commentHex: string): Promise<void> {
        // Confirm deletion
        if (!await ConfirmDialog.run(this.root, {ref: btn, placement: 'bottom-end'}, 'Are you sure you want to delete this comment?')) {
            return;
        }

        // Run deletion with the backend
        const r = await this.apiClient.post<ApiResponseBase>('comment/delete', {
            commenterToken: this.commenterTokenGet(),
            commentHex});
        if (this.setError(!r.success && r.message)) {
            return;
        }

        // Update the comment's text
        Wrap.byId(IDS.text + commentHex).inner('[deleted]');
        // TODO also remove all option buttons
    }

    /**
     * Vote (upvote, downvote, or undo vote) for the comment with the given hex ID.
     * @param commentHex Comment's hex ID.
     * @param oldDirection Previous vote direction.
     * @param direction Requested vote direction.
     * @private
     */
    private async vote(commentHex: string, oldDirection: number, direction: number): Promise<void> {
        const upvote   = Wrap.byId(IDS.upvote   + commentHex).noClasses('upvoted')  .classes(direction > 0 && 'upvoted');
        const downvote = Wrap.byId(IDS.downvote + commentHex).noClasses('downvoted').classes(direction < 0 && 'downvoted');
        this.updateUpDownAction(upvote, downvote, commentHex, direction);

        // Find the comment by its hex
        const comment = this.commentsByHex[commentHex];
        if (!comment) {
            return Promise.reject();
        }

        // Update the score reading
        const newScore = comment.score - oldDirection + direction;
        const ws = Wrap.byId(IDS.score + commentHex).inner(this.scorify(newScore));

        // Run the vote with the API
        const r = await this.apiClient.post<ApiResponseBase>('comment/vote', {commenterToken: this.commenterTokenGet(), commentHex, direction});

        // Undo the vote on failure
        if (this.setError(!r.success && r.message)) {
            upvote.noClasses('upvoted');
            downvote.noClasses('downvoted');
            ws.inner(this.scorify(comment.score));
            this.updateUpDownAction(upvote, downvote, commentHex, oldDirection);
            return Promise.reject();
        }

        // Succeeded
        comment.score = newScore;
    }

    /**
     * Toggle the given comment's sticky status.
     * @param commentHex Comment's hex ID.
     * @private
     */
    private async commentSticky(commentHex: string): Promise<void> {
        // Toggle the current comment's Sticky button, if any
        if (this.stickyCommentHex !== 'none') {
            Wrap.byId(IDS.sticky + this.stickyCommentHex).noClasses('option-unsticky').classes('option-sticky');
        }

        this.stickyCommentHex = this.stickyCommentHex === commentHex ? 'none' : commentHex;

        // Save the page's sticky comment ID
        await this.submitPageAttrs();

        // Update the new comment's Sticky button
        void Wrap.byId(IDS.sticky + commentHex)
            .noClasses(this.stickyCommentHex === commentHex ? 'option-sticky' : 'option-unsticky')
            .classes(this.stickyCommentHex === commentHex ? 'option-unsticky' : 'option-sticky');
    }

    /**
     * Submit the currently set page state (sticky comment and lock) to the backend.
     * @private
     */
    private async submitPageAttrs(): Promise<void> {
        const r = await this.apiClient.post<ApiResponseBase>('page/update', {
            commenterToken: this.commenterTokenGet(),
            domain:         parent.location.host,
            path:           this.pageId,
            attributes:     {isLocked: this.isLocked, stickyCommentHex: this.stickyCommentHex},
        });
        this.setError(!r.success && r.message);
    }
}
