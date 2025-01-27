import { Component, OnInit } from '@angular/core';
import { concatMap, tap } from 'rxjs';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { ApiGeneralService, Principal, StatsTotals } from '../../../../generated-api';
import { ProcessingStatus } from '../../../_utils/processing-status';
import { AuthService } from '../../../_services/auth.service';
import { MetricCardComponent } from './metric-card/metric-card.component';
import { StatsComponent } from '../stats/stats/stats.component';
import { NoDataComponent } from '../../tools/no-data/no-data.component';
import { LoaderDirective } from '../../tools/_directives/loader.directive';

@UntilDestroy()
@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    imports: [
        MetricCardComponent,
        StatsComponent,
        NoDataComponent,
        LoaderDirective,
    ],
})
export class DashboardComponent implements OnInit {

    principal?: Principal;
    totals?: StatsTotals;
    domainPageCounts?: number[];
    domainUserCounts?: number[];

    readonly loading = new ProcessingStatus();

    constructor(
        private readonly api: ApiGeneralService,
        private readonly authSvc: AuthService,
    ) {}

    ngOnInit(): void {
        // Subscribe to principal changes
        this.authSvc.principal
            .pipe(untilDestroyed(this))
            .subscribe(p => this.principal = p);

        // Fetch the totals from the backend. Serialise data fetching to unburden the backend
        this.api.dashboardTotals()
            .pipe(
                this.loading.processing(),
                concatMap(t => {
                    this.totals = t;
                    // Fetch domain page stats
                    return this.api.dashboardDailyStats('domainPages');
                }),
                concatMap(p => {
                    this.domainPageCounts = p;
                    // Fetch domain user stats
                    return this.api.dashboardDailyStats('domainUsers');
                }),
                tap(u => this.domainUserCounts = u),
            )
            .subscribe();
    }
}
