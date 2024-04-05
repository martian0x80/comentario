import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { FontAwesomeTestingModule } from '@fortawesome/angular-fontawesome/testing';
import { MockComponents, MockDirective, MockProvider } from 'ng-mocks';
import { ControlCenterComponent } from './control-center.component';
import { ConfirmDirective } from '../../tools/_directives/confirm.directive';
import { CommentService } from '../_services/comment.service';
import { UserAvatarComponent } from '../../tools/user-avatar/user-avatar.component';
import { mockAuthService, mockDomainSelector } from '../../../_utils/_mocks.spec';

describe('ControlCenterComponent', () => {

    let component: ControlCenterComponent;
    let fixture: ComponentFixture<ControlCenterComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ControlCenterComponent, MockDirective(ConfirmDirective), MockComponents(UserAvatarComponent)],
            imports: [RouterModule.forRoot([]), FontAwesomeTestingModule],
            providers: [
                mockAuthService(),
                mockDomainSelector(),
                MockProvider(CommentService, {countPending: of(0)}),
            ],
        })
            .compileComponents();

        fixture = TestBed.createComponent(ControlCenterComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('is created', () => {
        expect(component).toBeTruthy();
    });
});
