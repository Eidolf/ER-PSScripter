FROM postgres:15-alpine

# Install build dependencies and pgvector
RUN apk add --no-cache --virtual .build-deps \
    build-base \
    git \
    clang19 \
    llvm19-dev \
    && cd /tmp \
    && git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git \
    && cd pgvector \
    && make \
    && make install \
    && cd .. \
    && rm -rf pgvector \
    && apk del .build-deps
