from urllib.parse import urlencode

from django.core.paginator import Paginator
from django.db.models import Case, Count, F, IntegerField, Min, Prefetch, Q, When
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404, render
from django.templatetags.static import static
from django.urls import reverse

from .models import BlogCategory, BlogPost, Category, Product, ProductVariant

SHOP_PAGE_SIZE = 20
RELATED_LIMIT = 4
FEATURED_LIMIT = 8
HOME_VISIBLE_CATEGORIES = 6
BLOG_PAGE_SIZE = 6
RELATED_POSTS_LIMIT = 3
FALLBACK_IMAGE = "assets/img/product/product-1-1.png"


def _variant_prefetch():
    return Prefetch(
        "variants", queryset=ProductVariant.objects.order_by("price")
    )


def _product_base_queryset():
    """Catalog queryset with category + variants loaded and price annotated.

    One products query (+ one variants prefetch): templates must use the
    attached ``display_*`` attributes, never re-query relations per row.
    """
    return (
        Product.objects.select_related("category")
        .prefetch_related(_variant_prefetch())
        .annotate(min_variant_price=Min("variants__price"))
        .annotate(
            eff_price=Case(
                When(
                    pricing_unit=Product.PRICING_KG,
                    then=F("price_per_kg"),
                ),
                default=Coalesce("min_variant_price", "price_per_kg"),
                output_field=IntegerField(),
            )
        )
    )


def _unit_text(label):
    """Mirror the storefront unit line (mock: '1kg'->'1kg pack', 'bunch'->'Per bunch')."""
    text = (label or "").strip()
    if not text:
        return ""
    if text.lower().startswith("per "):
        return text
    if "kg" in text.lower():
        return f"{text} pack"
    return f"Per {text.lower()}"


def attach_display(products):
    """Attach purchasable display data using only prefetched relations.

    Price resolution: KG products use ``price_per_kg``; unit products use
    the default variant, then the cheapest variant, then ``price_per_kg``
    as a fallback (it is the only price field on the Product form, so a
    fixed price entered there still displays instead of hiding the card).
    """
    for product in products:
        variants = list(product.variants.all())
        default = next(
            (v for v in variants if v.is_default),
            variants[0] if variants else None,
        )
        product.display_variants = variants
        product.display_default = default
        if variants:
            product.options_text = ", ".join(v.label for v in variants)
        elif product.pricing_unit == Product.PRICING_KG:
            product.options_text = "per kg"
        else:
            product.options_text = "each"
        if product.pricing_unit == Product.PRICING_KG:
            product.display_price = product.price_per_kg
            product.display_unit_id = "kg"
            product.display_unit_text = "per kg"
        elif default is not None:
            product.display_price = default.price
            product.display_unit_id = default.label
            product.display_unit_text = _unit_text(default.label)
        elif product.price_per_kg is not None:
            product.display_price = product.price_per_kg
            product.display_unit_id = "each"
            product.display_unit_text = "each"
        else:
            product.display_price = None
            product.display_unit_id = ""
            product.display_unit_text = ""
        product.is_purchasable = (
            product.status != Product.STATUS_OUT
            and product.display_price is not None
        )
        if product.display_price is not None:
            product.price_display = f"\u20a6{product.display_price:,}"
        else:
            product.price_display = "\u20a6\u2014"
        if product.badge:
            product.badge_text = product.badge
            product.badge_class = "fd-badge is-right is-custom"
        else:
            product.badge_text = ""
            product.badge_class = "fd-badge is-right is-custom"
        if product.status == Product.STATUS_LIMITED:
            product.status_text = "Limited"
        elif product.status == Product.STATUS_OUT:
            product.status_text = "Out of Stock"
        else:
            product.status_text = "Available"
        product.status_class = "fd-badge is-status"
        if product.image:
            product.display_image_url = product.image.url
            try:
                product.display_image_w = product.image.width or 800
                product.display_image_h = product.image.height or 600
            except (ValueError, AttributeError, FileNotFoundError):
                product.display_image_w = 800
                product.display_image_h = 600
        else:
            product.display_image_url = static(FALLBACK_IMAGE)
            product.display_image_w = 203
            product.display_image_h = 190
        product.display_image_alt = (
            product.image_alt or f"{product.name} image"
        )
    return products


def _preserved_params(query):
    params = {}
    for key in ("q", "category", "avail", "sort"):
        value = query.get(key, "").strip()
        if value:
            params[key] = value
    return params


def _apply_listing_filters(request, qs):
    """Apply q/avail/sort from GET; returns (qs, query, avail, sort)."""
    query = request.GET.get("q", "").strip()
    avail = request.GET.get("avail", "all").strip() or "all"
    sort = request.GET.get("sort", "featured").strip() or "featured"

    if query:
        qs = qs.filter(
            Q(name__icontains=query) | Q(category__name__icontains=query)
        )
    if avail == "in":
        qs = qs.filter(status=Product.STATUS_IN)
    elif avail == "limited":
        qs = qs.filter(status=Product.STATUS_LIMITED)
    elif avail == "out":
        qs = qs.filter(status=Product.STATUS_OUT)
    else:
        avail = "all"

    if sort == "price-asc":
        qs = qs.order_by(F("eff_price").asc(nulls_last=True), "name")
    elif sort == "price-desc":
        qs = qs.order_by(F("eff_price").desc(nulls_last=True), "name")
    elif sort == "name":
        qs = qs.order_by("name")
    else:
        sort = "featured"
        qs = qs.order_by("-is_featured", "name")
    return qs, query, avail, sort


def index(request):
    home_categories = list(Category.objects.order_by("name"))
    featured_products = list(
        _product_base_queryset()
        .filter(is_featured=True)
        .order_by("-created_at", "name")[:FEATURED_LIMIT]
    )
    attach_display(featured_products)
    return render(
        request,
        "index.html",
        {
            "home_categories": home_categories,
            "featured_products": featured_products,
            "home_visible_count": HOME_VISIBLE_CATEGORIES,
        },
    )


def about(request):
    return render(request, 'about.html')


def contact(request):
    return render(request, 'contact.html')


def blog(request):
    posts = _published_posts()
    
    # Get featured posts (could be multiple, we'll pick one randomly with time-based seed)
    featured_posts = list(posts.filter(is_featured=True))
    if featured_posts:
        # Time-based rotation: changes every 10 minutes
        import time
        seed = int(time.time() // 600)  # Changes every 10 minutes
        featured = featured_posts[seed % len(featured_posts)]
    else:
        featured = None
    
    # Grid shows ALL published posts (including featured)
    paginator = Paginator(posts, BLOG_PAGE_SIZE)
    page_obj = paginator.get_page(request.GET.get("page"))

    context = {
        "featured": featured,
        "categories": list(BlogCategory.objects.order_by("name")),
        "posts": page_obj.object_list,
        "page_obj": page_obj,
        "total_count": paginator.count,
    }
    return render(request, 'blog.html', context)


def blog_category(request, slug):
    category = get_object_or_404(BlogCategory, slug=slug)
    qs = _published_posts().filter(category=category)

    paginator = Paginator(qs, BLOG_PAGE_SIZE)
    page_obj = paginator.get_page(request.GET.get("page"))

    context = {
        "category": category,
        "categories": list(BlogCategory.objects.order_by("name")),
        "posts": page_obj.object_list,
        "page_obj": page_obj,
        "total_count": paginator.count,
    }
    return render(request, 'blog-category.html', context)


def blog_detail(request, slug):
    post = get_object_or_404(_published_posts(), slug=slug)

    related = list(
        _published_posts()
        .filter(category=post.category)
        .exclude(pk=post.pk)[:RELATED_POSTS_LIMIT]
    )
    if len(related) < RELATED_POSTS_LIMIT:
        exclude_pks = [post.pk] + [p.pk for p in related]
        related += list(
            _published_posts().exclude(pk__in=exclude_pks)[
                : RELATED_POSTS_LIMIT - len(related)
            ]
        )

    topics = list(
        BlogCategory.objects.annotate(
            published_count=Count(
                "posts",
                filter=Q(posts__status=BlogPost.STATUS_PUBLISHED),
            )
        )
        .filter(published_count__gt=0)
        .order_by("name")
    )

    context = {
        "post": post,
        "related_posts": related,
        "topics": topics,
    }
    return render(request, 'blog-detail.html', context)


def _published_posts():
    return (
        BlogPost.objects.filter(status=BlogPost.STATUS_PUBLISHED)
        .select_related("category")
        .order_by("-published_at", "-id")
    )

def blog_search(request):
    query = request.GET.get("q", "").strip()
    posts = _published_posts()
    if query:
        posts = posts.filter(
            Q(title__icontains=query) |
            Q(category__name__icontains=query) |
            Q(excerpt__icontains=query) |
            Q(body__icontains=query) |
            Q(tags__icontains=query)
        )

    paginator = Paginator(posts, BLOG_PAGE_SIZE)
    page_obj = paginator.get_page(request.GET.get("page"))

    context = {
        "query": query,
        "categories": list(BlogCategory.objects.order_by("name")),
        "posts": page_obj.object_list,
        "page_obj": page_obj,
        "total_count": paginator.count,
    }
    return render(request, 'blog-search.html', context)


def privacy(request):
    return render(request, 'privacy.html')


def terms(request):
    return render(request, 'terms.html')


def product(request):
    categories = list(Category.objects.order_by("name"))
    category_slug = request.GET.get("category", "").strip()

    qs = _product_base_queryset()
    active_category = None
    if category_slug:
        active_category = next(
            (c for c in categories if c.slug == category_slug), None
        )
        if active_category is not None:
            qs = qs.filter(category=active_category)

    qs, query, avail, sort = _apply_listing_filters(request, qs)

    paginator = Paginator(qs, SHOP_PAGE_SIZE)
    page_obj = paginator.get_page(request.GET.get("page"))

    attach_display(page_obj.object_list)

    # Pills navigate between pages, so they use bare URLs: landing on a
    # category always shows its full range (filters reset). Within-page
    # filtering (search/avail/sort + pagination) preserves its own params.
    shop_url = reverse("harvest_castle:product")
    pills = [
        {
            "name": "All",
            "slug": "",
            "active": active_category is None,
            "href": shop_url,
        }
    ]
    for category in categories:
        pills.append(
            {
                "name": category.name,
                "slug": category.slug,
                "active": active_category is not None
                and active_category.slug == category.slug,
                "href": reverse(
                    "harvest_castle:product_category", args=[category.slug]
                ),
            }
        )

    context = {
        "categories": categories,
        "pills": pills,
        "products": page_obj.object_list,
        "page_obj": page_obj,
        "total_count": paginator.count,
        "query": query,
        "active_category": active_category,
        "avail": avail,
        "sort": sort,
        "base_query": urlencode(_preserved_params(request.GET)),
        "has_products": Product.objects.exists(),
    }
    return render(request, 'product.html', context)


def product_category(request, slug):
    category = get_object_or_404(Category, slug=slug)
    categories = list(Category.objects.order_by("name"))

    qs = _product_base_queryset().filter(category=category)
    qs, query, avail, sort = _apply_listing_filters(request, qs)

    paginator = Paginator(qs, SHOP_PAGE_SIZE)
    page_obj = paginator.get_page(request.GET.get("page"))

    attach_display(page_obj.object_list)

    shop_url = reverse("harvest_castle:product")
    pills = [
        {
            "name": "All",
            "slug": "",
            "active": False,
            "href": shop_url,
        }
    ]
    for other in categories:
        pills.append(
            {
                "name": other.name,
                "slug": other.slug,
                "active": other.slug == category.slug,
                "href": reverse(
                    "harvest_castle:product_category", args=[other.slug]
                ),
            }
        )

    context = {
        "category": category,
        "categories": categories,
        "pills": pills,
        "products": page_obj.object_list,
        "page_obj": page_obj,
        "total_count": paginator.count,
        "query": query,
        "avail": avail,
        "sort": sort,
        "base_query": urlencode(_preserved_params(request.GET)),
    }
    return render(request, 'product-category.html', context)


def _pdp_json(product):
    if product.pricing_unit == Product.PRICING_KG:
        variants = [
            {
                "id": "kg",
                "label": "per kg",
                "price": product.price_per_kg or 0,
            }
        ]
        default_id = "kg"
    elif product.display_variants:
        variants = [
            {"id": v.label, "label": v.label, "price": v.price}
            for v in product.display_variants
        ]
        default_id = (
            product.display_default.label if product.display_default else variants[0]["id"]
        )
    elif product.price_per_kg is not None:
        # Fixed price kept on the Product form with no variant rows yet:
        # same fallback the cards use, so PDP never shows ₦0 for a priced product.
        variants = [
            {
                "id": product.display_unit_id or "each",
                "label": product.display_unit_text or "each",
                "price": product.price_per_kg,
            }
        ]
        default_id = variants[0]["id"]
    else:
        variants = [{"id": "each", "label": "each", "price": 0}]
        default_id = "each"
    return {
        "id": product.slug,
        "name": product.name,
        "category": product.category.name,
        "status": product.status,
        "badge": product.badge_text,
        "defaultVariant": default_id,
        "desc": product.description,
        "images": [
            {
                "src": product.display_image_url,
                "alt": product.display_image_alt,
                "w": product.display_image_w,
                "h": product.display_image_h,
            }
        ],
        "variants": variants,
    }


def product_detail(request, slug):
    product = get_object_or_404(
        _product_base_queryset(), slug=slug
    )
    attach_display([product])

    related_same = list(
        _product_base_queryset()
        .filter(category=product.category)
        .exclude(pk=product.pk)
        .order_by("-is_featured", "name")[:RELATED_LIMIT]
    )
    if len(related_same) < RELATED_LIMIT:
        exclude_pks = [product.pk] + [p.pk for p in related_same]
        related_same += list(
            _product_base_queryset()
            .exclude(pk__in=exclude_pks)
            .order_by("-is_featured", "name")[: RELATED_LIMIT - len(related_same)]
        )
    attach_display(related_same)

    context = {
        "product": product,
        "related_products": related_same,
        "pdp_json": _pdp_json(product),
    }
    return render(request, 'product-details.html', context)


def checkout(request):
    return render(request, 'checkout.html')


def cart(request):
    return render(request, 'cart.html')


def order_confirmation(request):
    return render(request, 'order_confirmation.html')


def admin_dashboard(request):
    return render(request, 'admin-dashboard.html')


def admin_blog(request):
    return render(request, 'admin-blog.html')


# TEMPORARY FRONTEND PREVIEW VIEWS — remove before backend auth stage.
def admin_login_preview(request):
    return render(request, 'admin-login.html')


def admin_settings_preview(request):
    return render(request, 'admin-settings.html')


def admin_products_preview(request):
    return render(request, 'admin-products.html')


def admin_product_edit_preview(request):
    return render(request, 'admin-product-edit.html')


def admin_orders_preview(request):
    return render(request, 'admin-orders.html')


def admin_order_preview(request):
    return render(request, 'admin-order.html')


def admin_blog_edit_preview(request):
    return render(request, 'admin-blog-edit.html')


def admin_forgot_password_preview(request):
    return render(request, 'admin-forgot-password.html')


def admin_reset_password_preview(request):
    return render(request, 'admin-reset-password.html')


def admin_reset_password_complete_preview(request):
    return render(request, 'admin-reset-password-complete.html')


def admin_invitation_preview(request):
    return render(request, 'admin-invitation.html')


def admin_change_password_preview(request):
    return render(request, 'admin-change-password.html')


def admin_administrators_preview(request):
    return render(request, 'admin-administrators.html')


def admin_403_preview(request):
    return render(request, '403.html')
