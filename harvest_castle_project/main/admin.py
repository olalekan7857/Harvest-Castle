from django.contrib import admin
from django.utils.html import escape
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from .models import (
    BlogCategory,
    BlogPost,
    Category,
    Product,
    ProductVariant,
)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "updated_at")
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 1
    fields = ("label", "price", "is_default")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "image_preview",
        "name",
        "category",
        "pricing_unit",
        "price_per_kg",
        "status",
        "is_featured",
        "updated_at",
    )
    list_filter = ("category", "pricing_unit", "status", "is_featured")
    search_fields = ("name", "description", "category__name")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")
    inlines = [ProductVariantInline]

    @admin.display(description="Image")
    def image_preview(self, obj):
        if not obj.image:
            return "No image"
        try:
            url = obj.image.url
        except ValueError:
            return "No image"
        safe_url = escape(url)
        safe_alt = escape(obj.image_alt or obj.name)
        return mark_safe(
            f'<img src="{safe_url}" alt="{safe_alt}" '
            'width="60" height="60" style="object-fit:cover;border-radius:6px;" />'
        )


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ("product", "label", "price", "is_default")
    list_filter = ("is_default",)
    search_fields = ("product__name", "label")


@admin.register(BlogCategory)
class BlogCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "updated_at")
    list_display_links = ("name",)
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")
    save_on_top = True
    save_as = True


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    date_hierarchy = "published_at"
    list_display = (
        "image_preview",
        "title",
        "category",
        "author",
        "status",
        "is_featured",
        "published_at",
        "reading_time",
        "updated_at",
    )
    list_display_links = ("title",)
    list_filter = ("status", "category", "is_featured", "published_at")
    search_fields = ("title", "excerpt", "author", "tags", "category__name")
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ("image_tag", "reading_time", "created_at", "updated_at")
    fieldsets = (
        (
            "Blog Post",
            {
                "fields": (
                    "title",
                    "slug",
                    "category",
                    "author",
                    "status",
                    "published_at",
                    "is_featured",
                )
            },
        ),
        (
            "Content",
            {"fields": ("excerpt", "body")},
        ),
        (
            "Media",
            {"fields": ("image", "image_tag", "image_alt", "image_caption")},
        ),
        (
            "SEO",
            {"fields": ("seo_title", "seo_description")},
        ),
        (
            "Tags",
            {"fields": ("tags",)},
        ),
        (
            "Automatic information",
            {
                "fields": ("reading_time", "created_at", "updated_at"),
            },
        ),
    )
    save_on_top = True
    save_as = True

    @admin.display(description="Image")
    def image_preview(self, obj):
        if not obj.image:
            return "No image"
        try:
            url = obj.image.url
        except ValueError:
            return "No image"
        safe_url = escape(url)
        safe_alt = escape(obj.image_alt or obj.title)
        return mark_safe(
            f'<img src="{safe_url}" alt="{safe_alt}" '
            'width="60" height="60" style="object-fit:cover;border-radius:6px;" />'
        )

    @admin.display(description="Preview")
    def image_tag(self, obj):
        if obj is None or not obj.image:
            return "No image"
        try:
            url = obj.image.url
        except ValueError:
            return "No image"
        return format_html(
            '<img src="{}" alt="{}" width="120" height="120" '
            'style="object-fit:cover;border-radius:6px;" />',
            url,
            obj.image_alt or obj.title,
        )
