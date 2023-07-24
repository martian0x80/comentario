import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MockComponents, MockProvider } from 'ng-mocks';
import { FontAwesomeTestingModule } from '@fortawesome/angular-fontawesome/testing';
import { UserManagerComponent } from './user-manager.component';
import { SortSelectorComponent } from '../../sort-selector/sort-selector.component';
import { SortPropertyComponent } from '../../sort-selector/sort-property/sort-property.component';
import { IdentityProviderIconComponent } from '../../../tools/identity-provider-icon/identity-provider-icon.component';
import { ApiGeneralService } from '../../../../../generated-api';
import { ConfigService } from '../../../../_services/config.service';
import { ToolsModule } from '../../../tools/tools.module';

describe('UserManagerComponent', () => {

    let component: UserManagerComponent;
    let fixture: ComponentFixture<UserManagerComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [
                UserManagerComponent,
                MockComponents(SortSelectorComponent, SortPropertyComponent, IdentityProviderIconComponent),
            ],
            imports: [ReactiveFormsModule, FontAwesomeTestingModule, ToolsModule],
            providers: [
                MockProvider(ApiGeneralService),
                MockProvider(ConfigService),
            ],
        });
        fixture = TestBed.createComponent(UserManagerComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('is created', () => {
        expect(component).toBeTruthy();
    });
});
