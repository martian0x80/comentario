import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { FontAwesomeTestingModule } from '@fortawesome/angular-fontawesome/testing';
import { MockProviders, MockService } from 'ng-mocks';
import { NavbarComponent } from './navbar.component';
import { AuthService } from '../_services/auth.service';
import { DocsService } from '../_services/docs.service';

describe('NavbarComponent', () => {
    let component: NavbarComponent;
    let fixture: ComponentFixture<NavbarComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [NavbarComponent],
            imports: [RouterTestingModule, FontAwesomeTestingModule],
            providers: [
                {provide: AuthService, useValue: MockService(AuthService, {principal: of(null)})},
                MockProviders(DocsService),
            ],
        })
        .compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(NavbarComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('is created', () => {
        expect(component).toBeTruthy();
    });
});
