import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { MockProviders } from 'ng-mocks';
import { UnauthGuard } from './unauth.guard';
import { AuthService } from '../_services/auth.service';

describe('UnauthGuard', () => {

    let guard: UnauthGuard;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [RouterTestingModule],
            providers: [MockProviders(AuthService)],
        });
        guard = TestBed.inject(UnauthGuard);
    });

    it('is created', () => {
        expect(guard).toBeTruthy();
    });
});
