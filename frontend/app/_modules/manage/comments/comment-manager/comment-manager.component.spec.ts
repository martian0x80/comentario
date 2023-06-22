import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommentManagerComponent } from './comment-manager.component';

describe('CommentManagerComponent', () => {

    let component: CommentManagerComponent;
    let fixture: ComponentFixture<CommentManagerComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [CommentManagerComponent],
        });
        fixture = TestBed.createComponent(CommentManagerComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('is created', () => {
        expect(component).toBeTruthy();
    });
});
