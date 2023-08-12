import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MockComponents, MockProvider } from 'ng-mocks';
import { DashboardComponent } from './dashboard.component';
import { ApiGeneralService } from '../../../../generated-api';
import { ToolsModule } from '../../tools/tools.module';
import { StatsChartComponent } from '../stats-chart/stats-chart.component';
import { MetricCardComponent } from './metric-card/metric-card.component';
import { AuthService } from '../../../_services/auth.service';

describe('DashboardComponent', () => {

    let component: DashboardComponent;
    let fixture: ComponentFixture<DashboardComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [DashboardComponent, MockComponents(MetricCardComponent, StatsChartComponent)],
            imports: [ToolsModule],
            providers: [
                MockProvider(ApiGeneralService, {dashboardTotals: () => of({}) as any}),
                MockProvider(AuthService, {principal: of(null)}),
            ],
        })
            .compileComponents();

        fixture = TestBed.createComponent(DashboardComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('is created', () => {
        expect(component).toBeTruthy();
    });
});
