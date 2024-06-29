import { TestBed } from '@angular/core/testing';
import { MockProvider } from 'ng-mocks';
import { PluginService } from './plugin.service';
import { ConfigService } from './config.service';

describe('PluginService', () => {

    let service: PluginService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers:[
                MockProvider(ConfigService, {pluginConfig: {plugins: []}}),
            ],
        });
        service = TestBed.inject(PluginService);
    });

    it('is be created', () => {
        expect(service).toBeTruthy();
    });
});
