from django.shortcuts import render

# Create your views here.

def index(request):
    return render(request, 'index.html')


def about(request):
    return render(request, 'about.html')

def contact(request):
    return render(request, 'contact.html')

def blog(request):
    return render(request, 'blog.html')

def privacy(request):
    return render(request, 'privacy.html')

def terms(request):
    return render(request, 'terms.html')

def product(request):
    return render(request, 'product.html')

def product_detail(request):
    return render(request, 'product-details.html')

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

def layout(request):
    return render(request, 'layout.html')