# Bộ xử lý khuôn mặt cho đăng ký ảnh/video (cổng 8091, chỉ trong mạng Docker).
# Model không đóng vào image: mount thư mục face-node/models vào /models.
#   docker build -t smartdoor-face-api face-node
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PYTHONUTF8=1 PIP_NO_CACHE_DIR=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY *.py model-checksums.json ./
RUN useradd --system --uid 10001 app
USER app
ENV FACE_MODEL_ROOT=/models FACE_PROCESSOR_HOST=0.0.0.0 FACE_PROCESSOR_PORT=8091
EXPOSE 8091
CMD ["python", "-u", "enrollment_server.py"]
