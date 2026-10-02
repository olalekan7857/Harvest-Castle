from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.html import strip_tags
from django.utils.text import slugify


def _unique_slug(model, base_slug, pk=None):
    """Return a slug unique for ``model``, appending -2, -3... on conflict."""
    slug = base_slug or "item"
    candidate = slug
    counter = 2
    qs = model.objects.all()
    if pk is not None:
        qs = qs.exclude(pk=pk)
    while qs.filter(slug=candidate).exists():
        candidate = f"{slug}-{counter}"
        counter += 1
    return candidate


def calc_reading_time(html, words_per_minute=250):
    """Reading minutes for rich-text content (HTML stripped, min 1)."""
    words = len(strip_tags(html or "").split())
    return max(1, -(-words // words_per_minute))


class Category(models.Model):
    # Homepage tiles reuse the existing static category artwork so the
    # design stays identical; unknown/new slugs fall back to the default.
    TILE_IMAGES = {
        "vegetables": ("assets/img/categorie/categorie-1-1.png", "Fresh green vegetables"),
        "fruits": ("assets/img/categorie/categorie-1-2.png", "Fresh seasonal fruits"),
        "peppers": ("assets/img/categorie/categorie-1-3.png", "Fresh peppers"),
        "tomatoes": ("assets/img/categorie/categorie-1-4.png", "Fresh ripe tomatoes"),
        "onions": ("assets/img/categorie/categorie-1-5.png", "Fresh onions"),
        "tubers": ("assets/img/categorie/categorie-1-4.png", "Yams and tubers"),
        "herbs-spices": ("assets/img/categorie/categorie-1-2.png", "Fresh herbs and spices"),
    }
    DEFAULT_TILE_IMAGE = (
        "assets/img/categorie/categorie-1-1.png",
        "Fresh farm produce",
    )

    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name

    @property
    def tile_image(self):
        from django.templatetags.static import static

        path, _alt = self.TILE_IMAGES.get(self.slug, self.DEFAULT_TILE_IMAGE)
        return static(path)

    @property
    def tile_image_alt(self):
        _path, alt = self.TILE_IMAGES.get(self.slug, self.DEFAULT_TILE_IMAGE)
        return alt

    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            self.slug = _unique_slug(Category, slugify(self.name), self.pk)
        super().save(*args, **kwargs)


class Product(models.Model):
    STATUS_IN = "in"
    STATUS_LIMITED = "limited"
    STATUS_OUT = "out"
    STATUS_CHOICES = [
        (STATUS_IN, "Available"),
        (STATUS_LIMITED, "Limited"),
        (STATUS_OUT, "Out of Stock"),
    ]

    PRICING_KG = "kg"
    PRICING_UNIT = "unit"
    PRICING_CHOICES = [
        (PRICING_KG, "Per kilogram (quantity × price per kg)"),
        (PRICING_UNIT, "Fixed price (per variant)"),
    ]

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name="products"
    )
    description = models.TextField(max_length=2000)
    badge = models.CharField(max_length=24, blank=True, default="")
    pricing_unit = models.CharField(
        max_length=10,
        choices=PRICING_CHOICES,
        default=PRICING_UNIT,
        help_text="kg: totals are quantity × price per kg. "
        "unit: fixed price from the product variant.",
    )
    price_per_kg = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Whole naira per kilogram. Required for KG products. "
        "For fixed-price (unit) products set the price on the variant "
        "below instead — this value is only a display fallback.",
    )
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_IN
    )
    image = models.ImageField(upload_to="products/", blank=True, null=True)
    image_alt = models.CharField(
        max_length=125,
        blank=True,
        default="",
        help_text="Auto-filled as '<product name> image' when left empty. "
        "You can still edit it for a better description.",
    )
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_featured", "name"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        if self.pricing_unit == self.PRICING_KG:
            if not self.price_per_kg or self.price_per_kg <= 0:
                raise ValidationError(
                    {"price_per_kg": "KG products need a price per kg above ₦0."}
                )

    def save(self, *args, **kwargs):
        if not self.image_alt and self.name:
            self.image_alt = f"{self.name} image"
        if not self.slug and self.name:
            self.slug = _unique_slug(Product, slugify(self.name), self.pk)
        super().save(*args, **kwargs)

    @property
    def default_variant(self):
        return self.variants.filter(is_default=True).first()

    @property
    def min_price(self):
        if self.pricing_unit == self.PRICING_KG and self.price_per_kg:
            return self.price_per_kg
        variant = self.variants.order_by("price").first()
        return variant.price if variant else None


class ProductVariant(models.Model):
    """A genuinely different buyable option of a product.

    Variants are actual product options (e.g. pack size, bunch, basket),
    NOT KG quantity steps. KG quantities (0.5, 1.3, 2.75kg) are entered
    as quantities at order time and priced as quantity ×
    Product.price_per_kg — never stored as one variant per quantity.
    """

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="variants"
    )
    label = models.CharField(
        max_length=40,
        help_text="Actual product option (e.g. bunch, basket, pack). "
        "Do not create one variant per KG quantity.",
    )
    price = models.PositiveIntegerField(
        help_text="Fixed price in whole naira (₦) for this option."
    )
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ["price"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "label"],
                name="unique_variant_label_per_product",
            ),
        ]

    def __str__(self):
        return f"{self.product.name} — {self.label}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Ensure exactly one default: first variant becomes default,
        # setting one default unsets the others.
        if self.is_default:
            ProductVariant.objects.filter(product=self.product).exclude(
                pk=self.pk
            ).update(is_default=False)
        elif not ProductVariant.objects.filter(
            product=self.product, is_default=True
        ).exists():
            ProductVariant.objects.filter(pk=self.pk).update(is_default=True)


class BlogCategory(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Blog Category"
        verbose_name_plural = "Blog Categories"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            self.slug = _unique_slug(BlogCategory, slugify(self.name), self.pk)
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        from django.urls import reverse
        return reverse("harvest_castle:blog_category", args=[self.slug])


class BlogPost(models.Model):
    STATUS_PUBLISHED = "published"
    STATUS_DRAFT = "draft"
    STATUS_CHOICES = [
        (STATUS_PUBLISHED, "Published"),
        (STATUS_DRAFT, "Draft"),
    ]

    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True, blank=True)
    category = models.ForeignKey(
        BlogCategory, on_delete=models.PROTECT, related_name="posts"
    )
    excerpt = models.TextField(max_length=500)
    author = models.CharField(
        max_length=80, default="Harvest Castle Team", blank=True
    )
    tags = models.CharField(
        max_length=250,
        blank=True,
        default="",
        help_text="Comma-separated, e.g. tomatoes, storage, food waste.",
    )
    image = models.ImageField(
        upload_to="blog/",
        help_text="Required — every post must have a featured image.",
    )
    image_alt = models.CharField(
        max_length=125,
        blank=True,
        default="",
        help_text="Auto-filled as '<title> image' when left empty. "
        "You can still edit it for a better description.",
    )
    image_caption = models.CharField(max_length=200, blank=True, default="")
    body = models.TextField()
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT
    )
    is_featured = models.BooleanField(
        default=False,
        help_text="Editor's pick slot on the blog page.",
    )
    seo_title = models.CharField(
        max_length=160,
        blank=True,
        default="",
        help_text="Shown in browser tabs and search results. "
        "Leave empty to use the post title.",
    )
    seo_description = models.CharField(
        max_length=300,
        blank=True,
        default="",
        help_text="Short summary for search results "
        "(about 150–160 characters is ideal).",
    )
    reading_time = models.PositiveIntegerField(
        default=1,
        editable=False,
        help_text="Minutes, auto-calculated from the body (~250 wpm).",
    )
    published_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-published_at"]
        verbose_name = "Blog Post"
        verbose_name_plural = "Blog Posts"
        indexes = [
            models.Index(fields=["status", "published_at"]),
            models.Index(fields=["slug"]),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug and self.title:
            self.slug = _unique_slug(BlogPost, slugify(self.title), self.pk)
        if not self.author:
            self.author = "Harvest Castle Team"
        if not self.image_alt and self.title:
            self.image_alt = f"{self.title} image"
        self.reading_time = calc_reading_time(self.body)
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        from django.urls import reverse
        return reverse("harvest_castle:blog_detail", args=[self.slug])

    @property
    def is_published(self):
        return self.status == self.STATUS_PUBLISHED
