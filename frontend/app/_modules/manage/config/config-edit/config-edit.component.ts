import { Component, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { first } from 'rxjs';
import { ApiGeneralService } from '../../../../../generated-api';
import { ConfigService } from '../../../../_services/config.service';
import { ProcessingStatus } from '../../../../_utils/processing-status';
import { Paths } from '../../../../_utils/consts';
import { ToastService } from '../../../../_services/toast.service';
import { DynamicConfig } from '../../../../_models/config';

@UntilDestroy()
@Component({
    selector: 'app-config-edit',
    templateUrl: './config-edit.component.html',
})
export class ConfigEditComponent implements OnInit {

    /** Config being edited. */
    config?: DynamicConfig;

    /** Edit form. */
    form = this.fb.group({});

    readonly loading = new ProcessingStatus();
    readonly saving = new ProcessingStatus();

    constructor(
        private readonly router: Router,
        private readonly fb: FormBuilder,
        private readonly configSvc: ConfigService,
        private readonly api: ApiGeneralService,
        private readonly toastSvc: ToastService,
    ) {}

    ngOnInit(): void {
        // Fetch the config
        this.configSvc.dynamicConfig
            .pipe(
                untilDestroyed(this),
                first(),
                this.loading.processing())
            .subscribe(c => {
                // Make a clone of the original config
                this.config = c.clone();

                // Create a form group per config section
                Object.keys(this.config!.bySection).forEach(s => this.form.addControl(s, this.fb.group({}), {emitEvent: false}));
            });
    }

    submit() {
        // Submit the config to the backend
        this.api.configDynamicUpdate(this.config!.items)
            .pipe(this.saving.processing())
            .subscribe(() => {
                // Reload the config
                this.configSvc.dynamicReload();
                // Add a success toast
                this.toastSvc.success('data-saved').keepOnRouteChange();
                // Go back to the list
                this.router.navigate([Paths.manage.config.dynamic]);
            });
    }
}
