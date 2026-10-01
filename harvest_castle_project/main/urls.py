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
    path('privacy/', views.privacy, name='privacy'),
    path('terms/', views.terms, name='terms'),
    path('products/', views.product, name='product'),
    path('product-detail/', views.product_detail, name='product_detail'),
    path('checkout/', views.checkout, name='checkout'),
    path('cart/', views.cart, name='cart'),
    path('order-confirmation/', views.order_confirmation, name='order_confirmation'),
    path('admin-dashboard/', views.admin_dashboard, name='admin_dashboard'),
    path('admin-blog/', views.admin_blog, name='admin_blog'),
    path('layout/', views.layout, name='layout')
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)