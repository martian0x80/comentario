import { Component, OnInit } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import {
    faArrowDownUpAcrossLine,
    faAt,
    faChartLine,
    faChevronRight,
    faComments,
    faFileLines,
    faList,
    faQuestionCircle,
    faSignOutAlt,
    faTachometerAlt,
    faUsers,
    faUsersRectangle,
} from '@fortawesome/free-solid-svg-icons';
import { filter } from 'rxjs/operators';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Paths } from '../../../_utils/consts';
import { AuthService } from '../../../_services/auth.service';
import { DomainMeta, DomainSelectorService } from '../_services/domain-selector.service';
import { CommentService } from '../_services/comment.service';

@UntilDestroy()
@Component({
    selector: 'app-control-center',
    templateUrl: './control-center.component.html',
    styleUrls: ['./control-center.component.scss'],
})
export class ControlCenterComponent implements OnInit {

    /** Whether the sidebar is open by the user (only applies to small screens). */
    expanded = false;

    /** Domain/user metadata. */
    domainMeta?: DomainMeta;

    readonly Paths = Paths;

    readonly pendingCommentCount$ = this.commentService.countPending;

    // Icons
    readonly faArrowDownUpAcrossLine = faArrowDownUpAcrossLine;
    readonly faAt                    = faAt;
    readonly faChevronRight          = faChevronRight;
    readonly faChartLine             = faChartLine;
    readonly faComments              = faComments;
    readonly faFileLines             = faFileLines;
    readonly faList                  = faList;
    readonly faQuestionCircle        = faQuestionCircle;
    readonly faSignOutAlt            = faSignOutAlt;
    readonly faTachometerAlt         = faTachometerAlt;
    readonly faUsers                 = faUsers;
    readonly faUsersRectangle        = faUsersRectangle;

    constructor(
        private readonly router: Router,
        private readonly authSvc: AuthService,
        private readonly domainSelectorSvc: DomainSelectorService,
        private readonly commentService: CommentService,
    ) {}

    get isSuper(): boolean | undefined {
        return this.domainMeta?.principal?.isSuperuser;
    }

    get canManageDomain(): boolean | undefined {
        return this.domainMeta?.canManageDomain;
    }

    ngOnInit(): void {
        // Collapse the sidebar on route change
        this.router.events
            .pipe(untilDestroyed(this), filter(e => e instanceof NavigationStart))
            .subscribe(() => this.expanded = false);

        // Monitor selected domain/user changes
        this.domainSelectorSvc.domainMeta
            .pipe(untilDestroyed(this))
            .subscribe(meta => this.domainMeta = meta);
    }

    logout() {
        // Log off, then redirect to the home page
        this.authSvc.logout().subscribe(() => this.router.navigate(['/']));
    }

    toggleExpanded() {
        this.expanded = !this.expanded;
    }
}
