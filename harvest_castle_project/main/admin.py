from django.contrib import admin
from django.utils.html import escape
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
    list_display = ("name", "slug", "post_count", "updated_at")
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="Posts")
    def post_count(self, obj):
        return obj.posts.filter(status=BlogPost.STATUS_PUBLISHED).count()


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    list_display = (
        "image_preview",
        "title",
        "category",
        "status",
        "is_featured",
        "reading_time",
        "published_at",
    )
    list_filter = ("status", "category", "is_featured")
    search_fields = ("title", "excerpt", "tags")
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ("reading_time", "created_at", "updated_at")
    fields = (
        "title",
        "slug",
        "category",
        "excerpt",
        "author",
        "tags",
        "image",
        "image_alt",
        "image_caption",
        "body",
        "status",
        "is_featured",
        "seo_title",
        "seo_description",
        "reading_time",
        "published_at",
        "created_at",
        "updated_at",
    )

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
