from django.contrib import admin

from .models import (
    Alert,
    Asset,
    AuditLog,
    FicheProduct,
    Lot,
    LotDocumentMatch,
    LotEvent,
    LotTransformation,
    Membership,
    OcrJob,
    ProductAlias,
    Site,
)

admin.site.register(Site)
admin.site.register(FicheProduct)
admin.site.register(ProductAlias)
admin.site.register(Membership)
admin.site.register(Lot)
admin.site.register(LotDocumentMatch)
admin.site.register(LotEvent)
admin.site.register(LotTransformation)
admin.site.register(Asset)
admin.site.register(OcrJob)
admin.site.register(Alert)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("happened_at", "action", "actor_identifier", "site", "object_type", "object_id")
    search_fields = ("action", "actor_identifier", "object_type", "object_id")
    readonly_fields = [field.name for field in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
