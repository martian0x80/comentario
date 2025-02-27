import { Component, OnInit } from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { faCopy, faExclamationTriangle, faRotate } from '@fortawesome/free-solid-svg-icons';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { DomainMeta, DomainSelectorService } from '../../_services/domain-selector.service';
import { ApiGeneralService } from '../../../../../generated-api';
import { Paths } from '../../../../_utils/consts';
import { ProcessingStatus } from '../../../../_utils/processing-status';
import { DomainBadgeComponent } from '../../badges/domain-badge/domain-badge.component';
import { CopyTextDirective } from '../../../tools/_directives/copy-text.directive';
import { SpinnerDirective } from '../../../tools/_directives/spinner.directive';

@UntilDestroy()
@Component({
    selector: 'app-domain-sso-secret',
    templateUrl: './domain-sso-secret.component.html',
    imports: [
        DomainBadgeComponent,
        CopyTextDirective,
        FaIconComponent,
        SpinnerDirective,
        NgbTooltipModule,
    ],
})
export class DomainSsoSecretComponent implements OnInit {

    /** Domain/user metadata. */
    domainMeta?: DomainMeta;

    /** SSO secret generated by the API. */
    ssoSecret?: string;

    readonly Paths = Paths;
    readonly generating = new ProcessingStatus();

    // Icons
    readonly faCopy                = faCopy;
    readonly faExclamationTriangle = faExclamationTriangle;
    readonly faRotate              = faRotate;

    constructor(
        private readonly api: ApiGeneralService,
        private readonly domainSelectorSvc: DomainSelectorService,
    ) {}

    ngOnInit(): void {
        // Subscribe to domain changes
        this.domainSelectorSvc.domainMeta(true)
            .pipe(untilDestroyed(this))
            .subscribe(meta => this.domainMeta = meta);
    }

    generateSsoSecret() {
        this.api.domainSsoSecretNew(this.domainMeta!.domain!.id!)
            .pipe(this.generating.processing())
            .subscribe(r => {
                this.ssoSecret = r.ssoSecret;
                this.domainSelectorSvc.reload();
            });
    }
}
