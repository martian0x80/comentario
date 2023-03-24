import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PageNotFoundComponent } from './page-not-found/page-not-found.component';
import { HomeComponent } from './home/home.component';
import { authGuardCanLoad } from './_guards/auth.guard';

const routes: Routes = [
    // Auth
    {
        path: 'auth',
        loadChildren: () => import('./_modules/auth/auth.module').then(m => m.AuthModule),
    },

    // Control Center
    {
        path:         'manage',
        loadChildren: () => import('./_modules/manage/manage.module').then(m => m.ManageModule),
        canMatch:     [authGuardCanLoad],
    },

    // Fallback routes
    {path: '', pathMatch: 'full', component: HomeComponent},
    {path: '**',                  component: PageNotFoundComponent},
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule],
})
export class AppRoutingModule {}
