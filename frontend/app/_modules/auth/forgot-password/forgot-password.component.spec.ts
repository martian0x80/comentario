import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MockProviders } from 'ng-mocks';
import { ForgotPasswordComponent } from './forgot-password.component';
import { ApiGeneralService } from '../../../../generated-api';
import { ToastService } from '../../../_services/toast.service';
import { ToolsModule } from '../../tools/tools.module';

describe('ForgotPasswordComponent', () => {

    let component: ForgotPasswordComponent;
    let fixture: ComponentFixture<ForgotPasswordComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ForgotPasswordComponent],
            imports: [RouterModule.forRoot([]), ReactiveFormsModule, ToolsModule],
            providers: MockProviders(ToastService, ApiGeneralService),
        })
            .compileComponents();

        fixture = TestBed.createComponent(ForgotPasswordComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('is created', () => {
        expect(component).toBeTruthy();
    });
});
