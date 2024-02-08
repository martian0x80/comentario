import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { FontAwesomeTestingModule } from '@fortawesome/angular-fontawesome/testing';
import { MockComponents, MockProvider } from 'ng-mocks';
import { CommentListComponent } from './comment-list.component';
import { ApiGeneralService } from '../../../../../../generated-api';
import { ConfigService } from '../../../../../_services/config.service';
import { SortSelectorComponent } from '../../../sort-selector/sort-selector.component';
import { ToolsModule } from '../../../../tools/tools.module';
import { SortPropertyComponent } from '../../../sort-selector/sort-property/sort-property.component';
import { mockDomainSelector } from '../../../../../_utils/_mocks.spec';
import { UserLinkComponent } from '../../../user-link/user-link.component';

describe('CommentListComponent', () => {

    let component: CommentListComponent;
    let fixture: ComponentFixture<CommentListComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [CommentListComponent, MockComponents(SortSelectorComponent, SortPropertyComponent, UserLinkComponent)],
            imports: [ReactiveFormsModule, FontAwesomeTestingModule, ToolsModule],
            providers: [
                MockProvider(ApiGeneralService),
                MockProvider(ConfigService),
                mockDomainSelector(),
            ],
        });
        fixture = TestBed.createComponent(CommentListComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('is created', () => {
        expect(component).toBeTruthy();
    });
});
