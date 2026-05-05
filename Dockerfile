FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app.py /app/app.py
COPY static /app/static

EXPOSE 5055
CMD ["gunicorn", "-b", "0.0.0.0:5055", "--workers", "2", "--threads", "4", "app:app"]
