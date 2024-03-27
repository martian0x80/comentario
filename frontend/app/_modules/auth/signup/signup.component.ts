import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { first } from 'rxjs';
import { faBan, faCheck } from '@fortawesome/free-solid-svg-icons';
import { ProcessingStatus } from '../../../_utils/processing-status';
import { Paths } from '../../../_utils/consts';
import { ConfigService } from '../../../_services/config.service';
import { Animations } from '../../../_utils/animations';
import { ApiGeneralService } from '../../../../generated-api';
import { ToastService } from '../../../_services/toast.service';
import { InstanceConfigItemKey } from '../../../_models/config';

@Component({
    selector: 'app-signup',
    templateUrl: './signup.component.html',
    animations: [Animations.fadeInOut('slow')],
})
export class SignupComponent {

    isComplete = false;
    signupAllowed = false;

    readonly Paths = Paths;
    readonly submitting = new ProcessingStatus();
    readonly form = this.fb.nonNullable.group({
        email:    ['', [Validators.required, Validators.email, Validators.minLength(6), Validators.maxLength(254)]],
        password: '',
        name:     ['', [Validators.required, Validators.minLength(2), Validators.maxLength(63)]],
    });

    readonly tosUrl     = this.cfgSvc.staticConfig.termsOfServiceUrl;
    readonly privacyUrl = this.cfgSvc.staticConfig.privacyPolicyUrl;

    // Icons
    readonly faBan   = faBan;
    readonly faCheck = faCheck;

    constructor(
        private readonly fb: FormBuilder,
        private readonly router: Router,
        private readonly api: ApiGeneralService,
        private readonly toastSvc: ToastService,
        private readonly cfgSvc: ConfigService,
    ) {
        this.cfgSvc.dynamicConfig
            .pipe(first())
            .subscribe(dc => this.signupAllowed = dc.getBool(InstanceConfigItemKey.authSignupEnabled));
    }

    submit(): void {
        // Mark all controls touched to display validation results
        this.form.markAllAsTouched();

        // Submit the form if it's valid
        if (this.form.valid) {
            // Remove any toasts
            this.toastSvc.clear();

            // Submit the form
            const vals = this.form.value as Required<typeof this.form.value>;
            this.api.authSignup({email: vals.email, password: vals.password, name: vals.name})
                .pipe(this.submitting.processing())
                .subscribe(r => {
                    // If there's no confirmation email expected, redirect the user to login at once
                    if (r.isConfirmed) {
                        this.router.navigate([Paths.auth.login]);

                    // Show the info message otherwise
                    } else {
                        this.isComplete = true;
                    }
                });
        }
    }
}
