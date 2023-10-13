import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MockComponents } from 'ng-mocks';
import { ListFooterComponent } from './list-footer.component';
import { NoDataComponent } from '../no-data/no-data.component';

describe('ListFooterComponent', () => {

    let component: ListFooterComponent;
    let fixture: ComponentFixture<ListFooterComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [ListFooterComponent, MockComponents(NoDataComponent)],
        });
        fixture = TestBed.createComponent(ListFooterComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('is created', () => {
        expect(component).toBeTruthy();
    });
});
