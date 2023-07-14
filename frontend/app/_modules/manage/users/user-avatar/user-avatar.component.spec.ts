import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserAvatarComponent } from './user-avatar.component';
import { Configuration } from '../../../../../generated-api';

describe('UserAvatarComponent', () => {

    let component: UserAvatarComponent;
    let fixture: ComponentFixture<UserAvatarComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [UserAvatarComponent],
            providers: [
                {provide: Configuration, useValue: {}},
            ],
        });
        fixture = TestBed.createComponent(UserAvatarComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('is created', () => {
        expect(component).toBeTruthy();
    });
});
