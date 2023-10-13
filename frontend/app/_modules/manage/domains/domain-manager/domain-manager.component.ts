import { Component, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { debounceTime, distinctUntilChanged, first, merge, mergeWith, of, Subject, switchMap, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import { faCheck, faPlus } from '@fortawesome/free-solid-svg-icons';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { ApiGeneralService, Domain, DomainUser } from '../../../../../generated-api';
import { ProcessingStatus } from '../../../../_utils/processing-status';
import { Paths } from '../../../../_utils/consts';
import { DomainMeta, DomainSelectorService } from '../../_services/domain-selector.service';
import { ConfigService } from '../../../../_services/config.service';
import { Sort } from '../../_models/sort';
import { Animations } from '../../../../_utils/animations';

@UntilDestroy()
@Component({
    selector: 'app-domain-manager',
    templateUrl: './domain-manager.component.html',
    animations: [Animations.fadeIn('slow')],
})
export class DomainManagerComponent implements OnInit {

    /** Domain/user metadata. */
    domainMeta?: DomainMeta;

    /** Loaded list of domains. */
    domains?: Domain[];

    /** Whether there are more results to load. */
    canLoadMore = true;

    /** Whether the user is allowed to add a domain. */
    canAdd = false;

    /** Map that connects domain IDs to domain users. */
    readonly domainUsers = new Map<string, DomainUser>();

    /** Observable triggering a data load, while indicating whether a result reset is needed. */
    readonly load = new Subject<boolean>();

    readonly sort = new Sort('host');
    readonly domainsLoading = new ProcessingStatus();
    readonly Paths = Paths;

    readonly filterForm = this.fb.nonNullable.group({
        filter: '',
    });

    // Icons
    readonly faCheck = faCheck;
    readonly faPlus  = faPlus;

    private loadedPageNum = 0;

    constructor(
        private readonly fb: FormBuilder,
        private readonly api: ApiGeneralService,
        private readonly domainSelectorSvc: DomainSelectorService,
        private readonly configSvc: ConfigService,
    ) {
        this.domainSelectorSvc.domainMeta
            .pipe(
                untilDestroyed(this),
                tap(meta => this.domainMeta = meta),
                // Find out whether the user is allowed to add a domain: if the user isn't a superuser, check whether
                // new owners are allowed
                switchMap(() => this.domainMeta?.principal?.isSuperuser ?
                    of(true) :
                    this.configSvc.dynamicConfig.pipe(first(), map(dc => dc.get('operation.newOwner.enabled')?.value === 'true'))),
                // If no new owner enabled, the user must already own at least one domain
                switchMap(enabled => enabled ?
                    of(true) :
                    this.api.domainCount(true, false).pipe(map(count => count > 0))))
            .subscribe(canAdd => this.canAdd = canAdd);
    }

    /**
     * Whether a filter is currently active.
     */
    get filterActive(): boolean {
        return this.filterForm.controls.filter.value.length > 0;
    }

    ngOnInit(): void {
        merge(
                // Trigger an initial load
                of(undefined),
                // Subscribe to sort changes
                this.sort.changes.pipe(untilDestroyed(this)),
                // Subscribe to filter changes
                this.filterForm.controls.filter.valueChanges.pipe(untilDestroyed(this), debounceTime(500), distinctUntilChanged()))
            .pipe(
                // Map any of the above to true (= reset)
                map(() => true),
                // Subscribe to load requests
                mergeWith(this.load),
                // Reset the content/page if needed
                tap(reset => {
                    if (reset) {
                        this.domains = undefined;
                        this.domainUsers.clear();
                        this.loadedPageNum = 0;
                    }
                }),
                // Load the domain list
                switchMap(() =>
                    this.api.domainList(
                            this.filterForm.controls.filter.value,
                            ++this.loadedPageNum,
                            this.sort.property as any,
                            this.sort.descending)
                        .pipe(this.domainsLoading.processing())))
            .subscribe(r => {
                this.domains = [...this.domains || [], ...r.domains || []];
                this.canLoadMore = this.configSvc.canLoadMore(r.domains);

                // Make a map of domain ID => domain users
                r.domainUsers?.forEach(du => this.domainUsers.set(du.domainId!, du));
            });
    }
}
