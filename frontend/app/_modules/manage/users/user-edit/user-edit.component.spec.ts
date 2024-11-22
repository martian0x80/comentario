import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MockComponents, MockProvider } from 'ng-mocks';
import { UserEditComponent } from './user-edit.component';
import { ApiGeneralService, InstanceStaticConfig } from '../../../../../generated-api';
import { ToolsModule } from '../../../tools/tools.module';
import { InfoIconComponent } from '../../../tools/info-icon/info-icon.component';
import { mockAuthService } from '../../../../_utils/_mocks.spec';
import { ConfigService } from '../../../../_services/config.service';

describe('UserEditComponent', () => {

    let component: UserEditComponent;
    let fixture: ComponentFixture<UserEditComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [UserEditComponent, MockComponents(InfoIconComponent)],
            imports: [ReactiveFormsModule, ToolsModule],
            providers: [
                MockProvider(ConfigService, {staticConfig: {} as InstanceStaticConfig}),
                MockProvider(ApiGeneralService),
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
