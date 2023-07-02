import { Component, Input } from '@angular/core';
import { DomainUser } from '../../../../generated-api';

/**
 * Component that shows a badge for the given domain user, corresponding to their domain role.
 */
@Component({
    selector: 'app-domain-user-badge',
    templateUrl: './domain-user-badge.component.html',
    styleUrls: ['./domain-user-badge.component.scss'],
})
export class DomainUserBadgeComponent {

    /** Domain user in question. */
    @Input({required: true})
    domainUser?: DomainUser | null;

    get userClass(): string {
        return this.domainUser?.isOwner ?
            'user-owner' :
            this.domainUser?.isModerator ? 'user-moderator' :
                this.domainUser?.isCommenter ? 'user-commenter' : 'user-readonly';
    }
}
