import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MockComponents, MockProvider } from 'ng-mocks';
import { UserEditComponent } from './user-edit.component';
import { ApiGeneralService } from '../../../../../generated-api';
import { InfoIconComponent } from '../../../tools/info-icon/info-icon.component';
import { mockAuthService, mockConfigService } from '../../../../_utils/_mocks.spec';

describe('UserEditComponent', () => {

    let component: UserEditComponent;
    let fixture: ComponentFixture<UserEditComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
                imports: [RouterModule.forRoot([]), ReactiveFormsModule, UserEditComponent, MockComponents(InfoIconComponent)],
                providers: [
                    MockProvider(ApiGeneralService),
                    mockConfigService(),
                    mockAuthService(),
                ],
            })
            .compileComponents();
        fixture = TestBed.createComponent(UserEditComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('is created', () => {
        expect(component).toBeTruthy();
    });
});
