from django.urls import path
from . import views
from django.conf import settings
from django.conf.urls.static import static

app_name = 'harvest_castle'



urlpatterns = [
    path('', views.index, name='index'),
    path('about/', views.about, name='about'),
    path('contact/', views.contact, name='contact'),
    path('blog/', views.blog, name='blog'),
    path('blog/search/', views.blog_search, name='blog_search'),
    path('blog/category/<slug:slug>/', views.blog_category, name='blog_category'),
    path('blog/<slug:slug>/', views.blog_detail, name='blog_detail'),
    path('privacy/', views.privacy, name='privacy'),
    path('terms/', views.terms, name='terms'),
    path('products/', views.product, name='product'),
    path('products/categories/<slug:slug>/', views.product_category, name='product_category'),
    path('products/<slug:slug>/', views.product_detail, name='product_detail'),
    path('checkout/', views.checkout, name='checkout'),
    path('cart/', views.cart, name='cart'),
    path('order-confirmation/', views.order_confirmation, name='order_confirmation'),
    path('admin-dashboard/', views.admin_dashboard, name='admin_dashboard'),
    path('admin-blog/', views.admin_blog, name='admin_blog'),
    # TEMPORARY FRONTEND PREVIEW URLS — remove before backend auth stage.
    path('admin-login/', views.admin_login_preview, name='admin_login_preview'),
    path('admin-settings/', views.admin_settings_preview, name='admin_settings_preview'),
    path('admin-products/', views.admin_products_preview, name='admin_products_preview'),
    path('admin-product-edit/', views.admin_product_edit_preview, name='admin_product_edit_preview'),
    path('admin-orders/', views.admin_orders_preview, name='admin_orders_preview'),
    path('admin-order/', views.admin_order_preview, name='admin_order_preview'),
    path('admin-blog-edit/', views.admin_blog_edit_preview, name='admin_blog_edit_preview'),
    path('admin-forgot-password/', views.admin_forgot_password_preview, name='admin_forgot_password_preview'),
    path('admin-reset-password/', views.admin_reset_password_preview, name='admin_reset_password_preview'),
    path('admin-reset-password-complete/', views.admin_reset_password_complete_preview, name='admin_reset_password_complete_preview'),
    path('admin-invitation/', views.admin_invitation_preview, name='admin_invitation_preview'),
    path('admin-change-password/', views.admin_change_password_preview, name='admin_change_password_preview'),
    path('admin-administrators/', views.admin_administrators_preview, name='admin_administrators_preview'),
    path('admin-403/', views.admin_403_preview, name='admin_403_preview')
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)