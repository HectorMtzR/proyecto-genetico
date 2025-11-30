from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Tuple
import random
import math

app = FastAPI()

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# Modelos
class Point(BaseModel):
    x: float
    y: float

class Obstacle(BaseModel):
    x: float
    y: float
    radius: float

class EvolveRequest(BaseModel):
    cities: List[Point]
    obstacles: List[Obstacle]
    population: List[List[int]] = [] # Lista de permutaciones (rutas)
    pop_size: int = 100
    mutation_rate: float = 0.01
    generations_per_step: int = 10 # Evolucionamos 10 generaciones por petición para ir más rápido

class EvolveResponse(BaseModel):
    population: List[List[int]]
    best_route: List[int]
    best_distance: float
    generation: int

# --- Lógica Geométrica ---
def calculate_distance(city1: Point, city2: Point) -> float:
    return math.sqrt((city1.x - city2.x)**2 + (city1.y - city2.y)**2)

def line_intersects_circle(p1: Point, p2: Point, circle: Obstacle) -> bool:
    # Lógica simplificada: Verificamos si el círculo está demasiado cerca del segmento de línea
    # Vector de la línea
    dx, dy = p2.x - p1.x, p2.y - p1.y
    if dx == 0 and dy == 0: return False

    t = ((circle.x - p1.x) * dx + (circle.y - p1.y) * dy) / (dx*dx + dy*dy)
    
    # Encontrar el punto más cercano en el segmento
    t = max(0, min(1, t))
    closest_x = p1.x + t * dx
    closest_y = p1.y + t * dy

    dist_sq = (closest_x - circle.x)**2 + (closest_y - circle.y)**2
    return dist_sq < (circle.radius ** 2)

# --- Lógica Genética ---
def get_route_distance(route_indices: List[int], cities: List[Point], obstacles: List[Obstacle]):
    dist = 0
    penalty = 0
    
    for i in range(len(route_indices)):
        from_city = cities[route_indices[i]]
        to_city = cities[route_indices[(i + 1) % len(route_indices)]] # Volver al inicio
        
        d = calculate_distance(from_city, to_city)
        dist += d

        # Penalización por chocar con obstáculos
        for obs in obstacles:
            if line_intersects_circle(from_city, to_city, obs):
                penalty += 10000 # Penalización masiva para que la evolución descarte esta ruta

    return dist + penalty

def create_initial_population(pop_size, n_cities):
    population = []
    indices = list(range(n_cities))
    for _ in range(pop_size):
        random.shuffle(indices)
        population.append(indices[:])
    return population

def breed(parent1, parent2):
    # Ordered Crossover (OX1) para TSP
    start = int(random.random() * len(parent1))
    end = int(random.random() * len(parent1))
    
    if start > end: start, end = end, start

    child = [None] * len(parent1)
    # Copiar sub-segmento del padre 1
    for i in range(start, end):
        child[i] = parent1[i]
    
    # Rellenar con genes del padre 2 en orden, saltando los que ya existen
    p2_index = 0
    for i in range(len(child)):
        if child[i] is None:
            while parent2[p2_index] in child:
                p2_index += 1
            child[i] = parent2[p2_index]
            
    return child

def mutate(route, mutation_rate):
    # Swap Mutation
    for i in range(len(route)):
        if random.random() < mutation_rate:
            swap_with = int(random.random() * len(route))
            route[i], route[swap_with] = route[swap_with], route[i]
    return route

@app.post("/api/evolve")
def evolve(req: EvolveRequest):
    if len(req.cities) < 2:
        return {"population": [], "best_route": [], "best_distance": 0, "generation": 0}

    # 1. Inicializar si es necesario
    current_pop = req.population
    if not current_pop or len(current_pop) == 0:
        current_pop = create_initial_population(req.pop_size, len(req.cities))

    # 2. Bucle de Evolución (X generaciones)
    for _ in range(req.generations_per_step):
        # Evaluar Fitness
        scored_pop = []
        for individual in current_pop:
            score = get_route_distance(individual, req.cities, req.obstacles)
            scored_pop.append((score, individual))
        
        # Ordenar (Menor distancia es mejor)
        scored_pop.sort(key=lambda x: x[0])
        
        # Elitisimo: Guardamos los mejores
        new_pop = [x[1] for x in scored_pop[:10]] 
        
        # Reproducción (Torneo simple o Roulette)
        while len(new_pop) < req.pop_size:
            # Torneo simple: elegir 2 random del top 50% y cruzar
            parent1 = random.choice(scored_pop[:50])[1]
            parent2 = random.choice(scored_pop[:50])[1]
            child = breed(parent1, parent2)
            child = mutate(child, req.mutation_rate)
            new_pop.append(child)
            
        current_pop = new_pop

    # 3. Resultado final del lote
    best_route_indices = current_pop[0] # El primero es el mejor porque ordenamos
    best_dist = get_route_distance(best_route_indices, req.cities, req.obstacles)

    return {
        "population": current_pop, # Devolvemos estado para el siguiente loop
        "best_route": best_route_indices,
        "best_distance": best_dist,
        "generation": 0 # El frontend llevará la cuenta real
    }