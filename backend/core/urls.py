from django.urls import path

from .views import (
    AlertListView,
    AlertStatusUpdateView,
    CaptureLabelView,
    DraftLotListView,
    FicheImportView,
    LotReportCsvView,
    LotReportPdfView,
    ReconcileIdenticalLotsView,
    LotTransformView,
    LotValidateView,
    MeView,
    SiteListCreateView,
    TokenLoginView,
    debug_env,
)

urlpatterns = [
    path("debug/env", debug_env, name="debug-env"),
    path("auth/token", TokenLoginView.as_view(), name="auth-token"),
    path("auth/me", MeView.as_view(), name="auth-me"),
    path("sites", SiteListCreateView.as_view(), name="site-list-create"),
    path("import/fiches", FicheImportView.as_view(), name="fiches-import"),
    path("capture/label-photo", CaptureLabelView.as_view(), name="capture-label-photo"),
    path("lots/drafts", DraftLotListView.as_view(), name="lots-drafts"),
    path("lots/reconcile-identical", ReconcileIdenticalLotsView.as_view(), name="lots-reconcile-identical"),
    path("lots/<uuid:lot_id>/validate", LotValidateView.as_view(), name="lot-validate"),
    path("lots/<uuid:lot_id>/transform", LotTransformView.as_view(), name="lot-transform"),
    path("alerts", AlertListView.as_view(), name="alerts-list"),
    path("alerts/<uuid:alert_id>/status", AlertStatusUpdateView.as_view(), name="alerts-status-update"),
    path("reports/lots.csv", LotReportCsvView.as_view(), name="report-lots-csv"),
    path("reports/lots.pdf", LotReportPdfView.as_view(), name="report-lots-pdf"),
]
