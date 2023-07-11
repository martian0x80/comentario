import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { debounceTime, distinctUntilChanged, merge, tap } from 'rxjs';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import {
    faCheck,
    faQuestion,
    faTrashAlt,
    faUpRightFromSquare,
    faUser,
    faUsersRays,
    faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { ApiGeneralService, Comment, Commenter, Domain, DomainUser, Principal } from '../../../../../generated-api';
import { DomainSelectorService } from '../../_services/domain-selector.service';
import { ConfigService } from '../../../../_services/config.service';
import { Sort } from '../../_models/sort';
import { ProcessingStatus } from '../../../../_utils/processing-status';

@UntilDestroy()
@Component({
    selector: 'app-comment-list',
    templateUrl: './comment-list.component.html',
})
export class CommentListComponent implements OnInit {

    /**
     * Optional page ID to load comments for. If not provided, all comments for the current domain will be loaded.
     */
    @Input()
    pageId?: string;

    /** Logged-in principal. */
    principal?: Principal;

    /** Currently selected domain. */
    domain?: Domain;

    /** User in the currently selected domain. */
    domainUser?: DomainUser;

    /** Loaded list of comments. */
    comments?: Comment[];

    /** Whether the current user is a moderator, an owner of the domain, or a superuser. */
    isModerator = false;

    /** Whether there are more results to load. */
    canLoadMore = true;

    /** Loaded commenters. */
    readonly commenters = new Map<string, Commenter>();

    readonly sort = new Sort('created', true);
    readonly commentsLoading = new ProcessingStatus();
    readonly commentUpdating = new ProcessingStatus();

    readonly filterForm = this.fb.nonNullable.group({
        approved: false,
        pending:  false,
        rejected: false,
        others:   false,
        filter:   '',
    });

    // Icons
    readonly faCheck             = faCheck;
    readonly faQuestion          = faQuestion;
    readonly faTrashAlt          = faTrashAlt;
    readonly faUpRightFromSquare = faUpRightFromSquare;
    readonly faUser              = faUser;
    readonly faUsersRays         = faUsersRays;
    readonly faXmark             = faXmark;

    private loadedPageNum = 0;

    constructor(
        private readonly fb: FormBuilder,
        private readonly api: ApiGeneralService,
        private readonly domainSelectorSvc: DomainSelectorService,
        private readonly configSvc: ConfigService,
    ) {}

    ngOnInit(): void {
        // Load comment list
        this.load(true);

        // Subscribe to domain/sort/filter changes
        merge(
            this.domainSelectorSvc.domainUserIdps.pipe(
                untilDestroyed(this),
                // Store the domain and the user
                tap(data => {
                    this.principal  = data.principal;
                    this.domainUser = data.domainUser;
                    this.domain     = data.domain;
                    this.isModerator = !!(this.principal?.isSuperuser || this.domainUser?.isOwner || this.domainUser?.isModerator);
                    // If the user is a moderator, show others' pending comments
                    if (this.isModerator) {
                        this.filterForm.patchValue({pending: true, others: true});
                    } else {
                        // User is not a moderator: show all their comments
                        this.filterForm.patchValue({approved: true, pending: true, rejected: true});
                    }
                })),
            this.sort.changes.pipe(untilDestroyed(this)),
            this.filterForm.valueChanges.pipe(untilDestroyed(this), debounceTime(500), distinctUntilChanged()))
            .subscribe(() => this.load(true));
    }

    load(reset: boolean) {
        // Reset the content if needed
        if (reset || !this.domain) {
            this.comments = undefined;
            this.commenters.clear();
            this.loadedPageNum = 0;

            // Nothing can be loaded unless a domain is selected
            if (!this.domain) {
                return;
            }
        }

        // Load the domain list
        const f = this.filterForm.value;
        this.api.commentList(
                this.domain.id!, this.pageId, f.approved, f.pending, f.rejected, f.others, f.filter,
                ++this.loadedPageNum, this.sort.property as any, this.sort.descending)
            .pipe(this.commentsLoading.processing())
            .subscribe(r => {
                this.comments = [...this.comments || [], ...r.comments || []];
                this.canLoadMore = this.configSvc.canLoadMore(r.comments);

                // Make a map of user ID => commenter
                r.commenters?.forEach(cr => this.commenters.set(cr.id!, cr));
            });
    }

    deleteComment(c: Comment) {
        // Delete the comment
        this.api.commentDelete(c.id!)
            .pipe(this.commentsLoading.processing())
            // Remove the comment from the list
            .subscribe(() => {
                const i = this.comments?.indexOf(c);
                if (i && i >= 0) {
                    this.comments?.splice(i, 1)
                }
            });
    }

    moderateComment(c: Comment, approved: boolean) {
        // If the comment is pending moderation, set to approved/rejected
        let pending = !!c.isPending;
        if (pending) {
            pending = false;

        // Comment is already approved/rejected. If the state stays the same, make the comment pending again
        } else if (c.isApproved === approved) {
            pending = true;
        }

        // Update the comment
        this.api.commentModerate(c.id!, {pending, approved})
            .pipe(this.commentUpdating.processing())
            .subscribe(() => {
                c.isPending  = pending;
                c.isApproved = approved;
            });
    }
}
