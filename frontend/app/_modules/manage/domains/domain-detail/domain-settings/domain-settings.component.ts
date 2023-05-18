import { Component, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { faEdit } from '@fortawesome/free-solid-svg-icons';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Domain, FederatedIdentityProvider } from '../../../../../../generated-api';
import { ConfigService } from '../../../../../_services/config.service';
import { Paths } from '../../../../../_utils/consts';
import { DomainDetailComponent } from '../domain-detail.component';

@UntilDestroy()
@Component({
    selector: 'app-domain-settings',
    templateUrl: './domain-settings.component.html',
})
export class DomainSettingsComponent {

    _domain?: Domain;
    _fedIdps?: FederatedIdentityProvider[];

    readonly Paths = Paths;

    // Icons
    readonly faEdit = faEdit;

    constructor(
        @Inject(DOCUMENT) private readonly doc: Document,
        private readonly cfgSvc: ConfigService,
        details: DomainDetailComponent,
    ) {
        // Subscribe to domain changes
        details.domain.pipe(untilDestroyed(this)).subscribe(d => this._domain = d);
        // Subscribe to domain IdP changes
        details.federatedIdpIds
            .pipe(untilDestroyed(this))
            // Only add those federated identity providers available globally
            .subscribe(ids => this._fedIdps = ids && this.cfgSvc.clientConfig.federatedIdps.filter(idp => ids.includes(idp.id)));
    }
}
