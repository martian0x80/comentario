import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MockComponents, MockProvider } from 'ng-mocks';
import { UserEditComponent } from './user-edit.component';
import { ApiGeneralService } from '../../../../../generated-api';
import { ToolsModule } from '../../../tools/tools.module';
import { InfoIconComponent } from '../../../tools/info-icon/info-icon.component';

describe('UserEditComponent', () => {

    let component: UserEditComponent;
    let fixture: ComponentFixture<UserEditComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [UserEditComponent, MockComponents(InfoIconComponent)],
            imports: [ReactiveFormsModule, ToolsModule],
            providers: [
                MockProvider(ApiGeneralService),
            ],
        });
        fixture = TestBed.createComponent(UserEditComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('is created', () => {
        expect(component).toBeTruthy();
    });
});
